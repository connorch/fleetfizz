// Ships the fixture Config across a real Fleet, in order: each scenario
// starts from where the last one left the Fleet. Each checks fizz's exit code,
// the Ledger it saved, and what is actually on every Machine.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { dockerFleet } from "./docker.ts";
import { NOTES, SHARED_DIR } from "./fixture.ts";
import { Fleet } from "./fleet.ts";
import { type LedgerMachine, Prepared, probe, ship } from "./harness.ts";

const FleetLive = Prepared.layer.pipe(
  Layer.provideMerge(dockerFleet),
  Layer.provide(NodeServices.layer),
);

const itemsOf = (machines: ReadonlyArray<LedgerMachine>) =>
  machines.flatMap((m) => m.items.map((item) => ({ machine: m.name, ...item })));

layer(FleetLive, { timeout: "15 minutes" })("fizz ship", (it) => {
  it.effect("a fresh Fleet: pnpm installs, and its Globals wait for the next Ship", () =>
    Effect.gen(function* () {
      const { machines } = yield* Fleet;
      const { version, commit } = yield* Prepared;
      const result = yield* ship();
      expect(result.exitCode, result.output).toBe(0);
      expect(result.machines.map((m) => [m.name, m.status])).toEqual(
        machines.map((m) => [m.name, "ok"]),
      );
      for (const item of itemsOf(result.machines)) {
        if (item.name.startsWith("pnpm:")) {
          // A package manager a Ship installs serves its Globals from the next one.
          expect(item.status, `${item.machine} ${item.name}`).toBe("skipped");
          expect(item.detail).toMatch(/ship again/);
        } else {
          expect(["ok", "idle"], `${item.machine} ${item.name}: ${item.detail}`).toContain(
            item.status,
          );
        }
      }
      for (const machine of machines) {
        const found = yield* probe(machine.name);
        expect(found.fizz, machine.name).toBe(`fizz v${version}`);
        expect(found.notes, machine.name).toBe(NOTES);
        expect(found.runIsExecutable, machine.name).toBe("yes");
        expect(found.clone, machine.name).toBe(commit);
        expect(found.output, machine.name).toBe(commit);
      }
    }),
  );

  it.effect("the second Ship brings every Item in line, where it is targeted", () =>
    Effect.gen(function* () {
      const { machines } = yield* Fleet;
      const result = yield* ship();
      expect(result.exitCode, result.output).toBe(0);
      for (const item of itemsOf(result.machines))
        expect(["ok", "idle"], `${item.machine} ${item.name}: ${item.detail}`).toContain(
          item.status,
        );
      const config = (yield* probe(machines[0].name)).config;
      for (const [i, machine] of machines.entries()) {
        const found = yield* probe(machine.name);
        expect(found.skill, machine.name).toBe("yes");
        expect(found.config, machine.name).toBe(config);
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

  it.effect("a third Ship changes nothing", () =>
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
