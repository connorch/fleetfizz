// Ships the fixture Config across a real Fleet, in order: each scenario
// starts from where the last one left the Fleet. Each checks fizz's exit code,
// the Ledger it saved, and, where it changes something, what is actually on
// the Machines. Besides `fizz ship` and its flags, the scenarios run the
// commands that reach other Machines or change what a Ship does: `fizz logs`,
// `fizz config remove` and `add machines`, and `fizz self-update`.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { darwinFleet } from "./darwin.ts";
import { dockerFleet } from "./docker.ts";
import { mixedFleet } from "./mixed.ts";
import { NOTES, OUTPUT, SHARED_DIR } from "./fixture.ts";
import { Fleet } from "./fleet.ts";
import { fizz, type LedgerMachine, Prepared, probe, ship } from "./harness.ts";

// E2E_FLEET picks the Fleet: `docker` (the default), `darwin`, or `mixed`.
const FleetLive = Prepared.layer.pipe(
  Layer.provideMerge(
    Layer.unwrap(
      Effect.gen(function* () {
        const fleet = yield* Config.Literals(["docker", "darwin", "mixed"], "E2E_FLEET").pipe(
          Config.withDefault("docker"),
        );
        return { docker: dockerFleet, darwin: darwinFleet, mixed: mixedFleet }[fleet];
      }),
    ),
  ),
  Layer.provide(NodeServices.layer),
);

const itemsOf = (machines: ReadonlyArray<LedgerMachine>) =>
  machines.flatMap((m) => m.items.map((item) => ({ machine: m.name, ...item })));

const statusesOf = (machines: ReadonlyArray<LedgerMachine>) =>
  machines.map((m) => [m.name, m.status]);

// Every Machine but `except`, as Ledger statuses.
const allOk = (machines: ReadonlyArray<{ readonly name: string }>, except?: string) =>
  machines.filter((m) => m.name !== except).map((m) => [m.name, "ok"]);

// Real time, not a TestClock: the Fleets wait on Schedules.
layer(FleetLive, { timeout: "15 minutes", excludeTestServices: true })("fizz ship", (it) => {
  it.effect(
    "a fresh Fleet comes in line Ship by Ship, then every Item is where it is targeted",
    () =>
      Effect.gen(function* () {
        const { machines } = yield* Fleet;
        const { version, commit } = yield* Prepared;
        // An Item whose tool a Ship installs waits for the next Ship: pnpm's
        // Globals wait for pnpm, and the Skill for the skills CLI, a pnpm Global.
        let waiting = Infinity;
        for (let n = 1; n <= 3 && waiting > 0; n++) {
          const result = yield* ship();
          expect(result.exitCode, result.output).toBe(0);
          expect(statusesOf(result.machines)).toEqual(allOk(machines));
          const items = itemsOf(result.machines);
          for (const item of items) {
            const where = `Ship ${n}, ${item.machine} ${item.name}: ${item.detail}`;
            if (item.status === "skipped") expect(item.detail, where).toMatch(/ship again/);
            else expect(["ok", "idle"], where).toContain(item.status);
          }
          waiting = items.filter((item) => item.status === "skipped").length;
        }
        expect(waiting).toBe(0);

        const config = (yield* probe(machines[0].name)).config;
        for (const [i, machine] of machines.entries()) {
          const found = yield* probe(machine.name);
          expect(found.fizz, machine.name).toBe(`fizz v${version}`);
          expect(found.config, machine.name).toBe(config);
          expect(found.notes, machine.name).toBe(NOTES);
          expect(found.runIsExecutable, machine.name).toBe("yes");
          expect(found.clone, machine.name).toBe(commit);
          expect(found.output, machine.name).toBe(commit);
          expect(found.skill, machine.name).toBe("yes");
          expect(found.globals.skills, machine.name).toMatch(/^1\./);
          // Targeted by `machines` at the first remote Machine only.
          expect(found.globals.semver, machine.name).toEqual(
            i === 1 ? expect.stringMatching(/^7\./) : undefined,
          );
          // A Variant per Platform.
          expect(found.globals["is-number"], machine.name).toMatch(
            machine.platform === "darwin" ? /^6\./ : /^7\./,
          );
        }
      }),
  );

  it.effect("the next Ship changes nothing", () =>
    Effect.gen(function* () {
      const result = yield* ship();
      expect(result.exitCode, result.output).toBe(0);
      const changed = itemsOf(result.machines).filter((item) => item.changes);
      expect(changed, result.output).toEqual([]);
    }),
  );

  it.effect("fizz logs on another Machine reads the Ship Log over tailscale ssh", () =>
    Effect.gen(function* () {
      const [start, second] = (yield* Fleet).machines;
      const here = yield* fizz(start.name, "logs");
      expect(here.exitCode, here.output).toBe(0);
      expect(here.output).toContain(`[${second.name} `);
      // The second Machine has no Ship Log of its own: the last Ship that
      // reached it started on the Starting Machine, and its log is there.
      const there = yield* fizz(second.name, "logs");
      expect(there.exitCode, there.output).toBe(0);
      expect(there.output).toBe(here.output);
    }),
  );

  it.effect("a Machine that cannot be reached is skipped, not failed", () =>
    Effect.gen(function* () {
      const fleet = yield* Fleet;
      const off = fleet.machines.at(-1)?.name ?? "";
      yield* fleet.stop(off);
      const result = yield* ship().pipe(Effect.ensuring(Effect.orDie(fleet.resume(off))));
      expect(result.exitCode, result.output).toBe(0);
      expect(statusesOf(result.machines)).toEqual(
        fleet.machines.map((m) => [m.name, m.name === off ? "skipped" : "ok"]),
      );
    }),
  );

  it.effect("Drift in a Shared File is overwritten when the Question is answered so", () =>
    Effect.gen(function* () {
      const fleet = yield* Fleet;
      const edited = fleet.machines[1].name;
      yield* fleet.run(edited, `printf 'edited by hand\\n' > ${SHARED_DIR}/notes.txt`);
      const result = yield* ship("--answer", "file=overwrite");
      expect(result.exitCode, result.output).toBe(0);
      const shared = itemsOf(result.machines).find(
        (i) => i.machine === edited && i.name === "files:shared",
      );
      expect(shared?.status, result.output).toBe("ok");
      expect((yield* probe(edited)).notes).toBe(NOTES);
    }),
  );

  it.effect("--only ships to the named Machine and no other", () =>
    Effect.gen(function* () {
      const fleet = yield* Fleet;
      const { commit } = yield* Prepared;
      const [start, second] = fleet.machines;
      for (const machine of [start, second])
        yield* fleet.run(machine.name, `printf 'stale\\n' > ${OUTPUT}`);
      // --rebuild reruns the Install Command, which writes the Output again.
      const result = yield* ship("--only", second.name, "--rebuild", "repos:fixture");
      expect(result.exitCode, result.output).toBe(0);
      expect(statusesOf(result.machines)).toEqual([[second.name, "ok"]]);
      expect((yield* probe(second.name)).output).toBe(commit);
      expect((yield* probe(start.name)).output).toBe("stale");
    }),
  );

  it.effect("--rebuild reruns a record Item that is up to date", () =>
    Effect.gen(function* () {
      const { machines } = yield* Fleet;
      const { commit } = yield* Prepared;
      const result = yield* ship("--rebuild", "repos:fixture");
      expect(result.exitCode, result.output).toBe(0);
      const rebuilt = itemsOf(result.machines).filter((item) => item.name === "repos:fixture");
      expect(rebuilt.map((item) => [item.machine, item.status, item.changes])).toEqual(
        machines.map((m) => [m.name, "ok", true]),
      );
      for (const machine of machines) expect((yield* probe(machine.name)).output).toBe(commit);
    }),
  );

  it.effect("fizz self-update moves the Starting Machine, and the next Ship every Machine", () =>
    Effect.gen(function* () {
      const { machines } = yield* Fleet;
      const { next } = yield* Prepared;
      const start = machines[0].name;
      const updated = yield* fizz(start, "self-update", next);
      expect(updated.exitCode, updated.output).toBe(0);
      expect((yield* probe(start)).fizz).toBe(`fizz v${next}`);

      const result = yield* ship();
      expect(result.exitCode, result.output).toBe(0);
      expect(statusesOf(result.machines)).toEqual(allOk(machines));
      const config = (yield* probe(start)).config;
      for (const machine of machines) {
        const found = yield* probe(machine.name);
        expect(found.fizz, machine.name).toBe(`fizz v${next}`);
        expect(found.config, machine.name).toBe(config);
      }
    }),
  );

  it.effect("a Machine taken out of the Fleet is not shipped to until it is added back", () =>
    Effect.gen(function* () {
      const { machines } = yield* Fleet;
      const start = machines[0].name;
      const out = machines.at(-1)?.name ?? "";
      const removed = yield* fizz(start, "config", "remove", `machines:${out}`);
      expect(removed.exitCode, removed.output).toBe(0);
      const without = yield* ship();
      expect(without.exitCode, without.output).toBe(0);
      expect(statusesOf(without.machines)).toEqual(allOk(machines, out));

      // `config add machines` finds it on the tailnet.
      const added = yield* fizz(start, "config", "add", "machines", out);
      expect(added.exitCode, added.output).toBe(0);
      const back = yield* ship();
      expect(back.exitCode, back.output).toBe(0);
      expect(statusesOf(back.machines)).toEqual(allOk(machines));
    }),
  );
});
