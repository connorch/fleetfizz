import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { MachinePlan } from "@fleetfizz/core";
import { doneLine, END_STEP, stepId, stepLine } from "@fleetfizz/remote";

import type { Ledger } from "./ledger.ts";
import { apply } from "./machine.ts";

// A ledger that records lines instead of printing them.
const fakeLedger = () => {
  const lines: string[] = [];
  const ledger: Ledger = {
    line: (_who, tag, message) => Effect.sync(() => void lines.push(`${tag} ${message}`)),
    fail: (_who, details) => Effect.sync(() => void lines.push(`FAIL ${details.join(" | ")}`)),
  };
  return { lines, ledger };
};

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

// Scripts run in the local login shell and print markers like the real Apply script.
const run = (plan: MachinePlan, script: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const { lines, ledger } = fakeLedger();
    const outcome = yield* apply(local, plan, script.join("\n"), [""], ledger);
    return { outcome, lines };
  }).pipe(Effect.provide(NodeServices.layer));

describe("apply", () => {
  it.effect("labels the install step and reports an OK summary", () =>
    Effect.gen(function* () {
      const { outcome, lines } = yield* run(repoPlan(), [
        stepLine(fetch),
        doneLine(fetch, true),
        stepLine(install),
        "echo Progress: resolved 1",
        doneLine(install, true),
        doneLine(END_STEP, true),
      ]);
      expect(outcome).toBe("ok");
      expect(lines).toEqual(["RUN skills install", "OK skills installed"]);
    }),
  );

  it.effect("shows a failed step's output and exit code", () =>
    Effect.gen(function* () {
      const { outcome, lines } = yield* run(repoPlan(), [
        stepLine(fetch),
        doneLine(fetch, true),
        stepLine(install),
        "echo ERR_PNPM_NO_LOCKFILE",
        doneLine(install, false, "2"),
        doneLine(END_STEP, true),
      ]);
      expect(outcome).toBe("failed");
      expect(lines).toEqual([
        "RUN skills install",
        `FAIL ${install} failed (exit 2) | ERR_PNPM_NO_LOCKFILE`,
      ]);
    }),
  );

  it.effect("fails a step cut off before its marker, and a script cut off before its end", () =>
    Effect.gen(function* () {
      const cutStep = yield* run(repoPlan(), [stepLine(fetch), "echo cloning", "exit 0"]);
      expect(cutStep.outcome).toBe("failed");
      expect(cutStep.lines).toEqual([`FAIL ${fetch} did not finish | cloning`]);

      const cutEnd = yield* run(repoPlan(), [stepLine(fetch), doneLine(fetch, true)]);
      expect(cutEnd.outcome).toBe("failed");
      expect(cutEnd.lines).toEqual(["FAIL apply did not finish"]);
    }),
  );

  it.effect("keeps a Machine failed when its plan had failures, even if every step passed", () =>
    Effect.gen(function* () {
      const plan = repoPlan([{ what: "vp", reason: "vp is not installed" }]);
      const { outcome, lines } = yield* run(plan, [
        stepLine(fetch),
        doneLine(fetch, true),
        doneLine(END_STEP, true),
      ]);
      expect(outcome).toBe("failed");
      expect(lines).toEqual([]);
    }),
  );
});
