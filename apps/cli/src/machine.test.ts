import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { emptyState, type MachinePlan } from "@fleetfizz/core";
import { doneLine, END_STEP, stepId, stepLine } from "@fleetfizz/remote";

import { makeLedger } from "./ledger.ts";
import { apply } from "./machine.ts";

const repoPlan = (failures: MachinePlan["failures"] = []): MachinePlan => ({
  machine: { name: "studio", platform: "darwin" },
  vp: [],
  repos: [
    {
      name: "skills",
      origin: "connorch/skills",
      ref: "main",
      pin: false,
      path: "~/clones/skills",
      expanded: "/Users/c/clones/skills",
      install: "pnpm install",
      files: {},
      outputs: [],
      decision: { run: true, reason: "never installed" },
    },
  ],
  questions: [],
  skipped: [],
  failures,
});

const fetch = stepId("skills", "fetch");
const install = stepId("skills", "install");
const local = { name: "studio", local: true };

// Scripts run in the local login shell and print markers like the real Apply
// script. Returns the outcome, the Machine on the Ledger, and its repo item.
const run = (plan: MachinePlan, script: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const { ledger, store } = yield* makeLedger({
      from: "studio",
      dryRun: false,
      machines: ["studio"],
      print: () => Effect.void,
    });
    yield* ledger.plan("studio", plan, emptyState);
    const { outcome } = yield* apply(local, plan, script.join("\n"), [""], ledger);
    const machine = store.get().state.machines[0];
    return { outcome, machine, skills: machine?.items.find((i) => i.name === "skills") };
  }).pipe(Effect.provide(NodeServices.layer));

describe("apply", () => {
  it.effect("marks the repo installed at the commit its fetch reached", () =>
    Effect.gen(function* () {
      const { outcome, machine, skills } = yield* run(repoPlan(), [
        stepLine(fetch),
        `printf 'ff-state %s\\n' '{"fact":"repo","name":"skills","present":true,"head":"9e02bb1d"}'`,
        doneLine(fetch, true),
        stepLine(install),
        "echo Progress: resolved 1",
        doneLine(install, true),
        doneLine(END_STEP, true),
      ]);
      expect(outcome).toBe("ok");
      expect(machine?.status).toBe("ok");
      expect(skills).toMatchObject({ status: "ok", to: "9e02bb1" });
      expect(skills?.output).toBeUndefined();
    }),
  );

  it.effect("keeps a failed step's output and exit code", () =>
    Effect.gen(function* () {
      const { outcome, skills } = yield* run(repoPlan(), [
        stepLine(fetch),
        doneLine(fetch, true),
        stepLine(install),
        "echo ERR_PNPM_NO_LOCKFILE",
        doneLine(install, false, "2"),
        doneLine(END_STEP, true),
      ]);
      expect(outcome).toBe("failed");
      expect(skills).toMatchObject({
        status: "failed",
        detail: "exit 2",
        output: ["ERR_PNPM_NO_LOCKFILE"],
      });
    }),
  );

  it.effect("fails a step cut off before its marker, and a script cut off before its end", () =>
    Effect.gen(function* () {
      const cutStep = yield* run(repoPlan(), [stepLine(fetch), "echo cloning", "exit 0"]);
      expect(cutStep.outcome).toBe("failed");
      expect(cutStep.skills).toMatchObject({
        status: "failed",
        detail: "did not finish",
        output: ["cloning"],
      });

      const cutEnd = yield* run(repoPlan(), [stepLine(fetch), doneLine(fetch, true)]);
      expect(cutEnd.outcome).toBe("failed");
      expect(cutEnd.machine).toMatchObject({ status: "failed", detail: "apply did not finish" });
    }),
  );

  it.effect("keeps a Machine failed when its plan had failures, even if every step passed", () =>
    Effect.gen(function* () {
      const plan = repoPlan([{ what: "vp", reason: "vp is not installed", section: "vp" }]);
      const { outcome, machine } = yield* run(plan, [
        stepLine(fetch),
        doneLine(fetch, true),
        doneLine(END_STEP, true),
      ]);
      expect(outcome).toBe("failed");
      expect(machine?.items.find((i) => i.name === "vp")).toMatchObject({
        status: "failed",
        detail: "vp is not installed",
      });
    }),
  );
});
