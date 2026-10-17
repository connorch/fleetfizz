import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { MachinePlan, ProviderPlan } from "@fleetfizz/core";
import { doneLine, END_STEP, skipLine, stepLine } from "@fleetfizz/remote";

import { makeLedger } from "./ledger.ts";
import { apply } from "./machine.ts";

const fetch = "repos:skills:fetch";
const install = "repos:skills:install";

// A Machine whose repos Provider fetches and installs skills, with `more`
// decisions beside it.
const repoPlan = (more: ProviderPlan["decisions"] = []): MachinePlan => ({
  machine: { name: "studio", platform: "darwin" },
  providers: [
    {
      name: "repos",
      rule: "record",
      dependsOn: [],
      decisions: [
        {
          kind: "change",
          item: "skills",
          to: "9e02bb1",
          reason: "never installed",
          change: undefined,
        },
        ...more,
      ],
      steps: [
        { id: fetch, items: ["skills"], doing: "fetching", run: [] },
        { id: install, items: ["skills"], doing: "installing", run: [] },
      ],
    },
  ],
});
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
    yield* ledger.plan("studio", plan);
    const { outcome } = yield* apply(local, plan, script.join("\n"), [""], ledger);
    const machine = store.get().state.machines[0];
    return { outcome, machine, skills: machine?.items.find((i) => i.name === "repos:skills") };
  }).pipe(Effect.provide(NodeServices.layer));

describe("apply", () => {
  it.effect("marks a repo installed once its last step is done", () =>
    Effect.gen(function* () {
      const { outcome, machine, skills } = yield* run(repoPlan(), [
        stepLine(fetch),
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

  it.effect("takes the version a step reports it reached", () =>
    Effect.gen(function* () {
      const { skills } = yield* run(repoPlan(), [
        stepLine(fetch),
        doneLine(fetch, true),
        stepLine(install),
        `echo 'ff-state {"provider":"repos","fact":"at","item":"skills","at":"1f2e3d4"}'`,
        doneLine(install, true),
        doneLine(END_STEP, true),
      ]);
      expect(skills).toMatchObject({ status: "ok", to: "1f2e3d4", changes: true });
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

  it.effect("shows a step the script skipped, with its reason", () =>
    Effect.gen(function* () {
      const { outcome, skills } = yield* run(repoPlan(), [
        skipLine(fetch, "'depends on vp'"),
        skipLine(install, "'depends on vp'"),
        doneLine(END_STEP, true),
      ]);
      expect(outcome).toBe("ok");
      expect(skills).toMatchObject({ status: "skipped", detail: "depends on vp" });
    }),
  );

  it.effect("keeps a Machine failed when its plan had failures, even if every step passed", () =>
    Effect.gen(function* () {
      const plan = repoPlan([{ kind: "fail", item: "dotfiles", reason: "could not resolve main" }]);
      const { outcome, machine } = yield* run(plan, [
        stepLine(fetch),
        doneLine(fetch, true),
        stepLine(install),
        doneLine(install, true),
        doneLine(END_STEP, true),
      ]);
      expect(outcome).toBe("failed");
      expect(machine?.items.find((i) => i.name === "repos:dotfiles")).toMatchObject({
        status: "failed",
        detail: "could not resolve main",
      });
    }),
  );
});
