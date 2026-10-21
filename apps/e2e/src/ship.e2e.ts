// Ships the fixture Config across a real Fleet, in order: each scenario
// starts from where the last one left the Fleet. Each checks fizz's exit code,
// the Ledger it saved, and, where it changes something, what is actually on
// the Machines.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { darwinFleet } from "./darwin.ts";
import { dockerFleet } from "./docker.ts";
import { NOTES, SHARED_DIR } from "./fixture.ts";
import { Fleet } from "./fleet.ts";
import { type LedgerMachine, Prepared, probe, ship } from "./harness.ts";

// E2E_FLEET picks the Fleet: `docker` (the default) or `darwin`.
const FleetLive = Prepared.layer.pipe(
  Layer.provideMerge(
    Layer.unwrap(
      Effect.gen(function* () {
        const fleet = yield* Config.Literals(["docker", "darwin"], "E2E_FLEET").pipe(
          Config.withDefault("docker"),
        );
        return fleet === "darwin" ? darwinFleet : dockerFleet;
      }),
    ),
  ),
  Layer.provide(NodeServices.layer),
);

const itemsOf = (machines: ReadonlyArray<LedgerMachine>) =>
  machines.flatMap((m) => m.items.map((item) => ({ machine: m.name, ...item })));

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
          expect(result.machines.map((m) => [m.name, m.status])).toEqual(
            machines.map((m) => [m.name, "ok"]),
          );
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

  it.effect("a Machine that cannot be reached is skipped, not failed", () =>
    Effect.gen(function* () {
      const fleet = yield* Fleet;
      const off = fleet.machines.at(-1)?.name ?? "";
      yield* fleet.stop(off);
      const result = yield* ship().pipe(Effect.ensuring(Effect.orDie(fleet.resume(off))));
      expect(result.exitCode, result.output).toBe(0);
      expect(result.machines.map((m) => [m.name, m.status])).toEqual(
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
});
