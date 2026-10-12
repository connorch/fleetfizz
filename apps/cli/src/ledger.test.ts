import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { emptyState, type MachinePlan, type MachineState, type RepoStep } from "@fleetfizz/core";
import { CONFIG_STEP, stepId, vpStepId } from "@fleetfizz/remote";

import { makeLedger } from "./ledger.ts";
import { ledgerText } from "./view.tsx";

const repo = (name: string, head: string, decision: RepoStep["decision"]): RepoStep => ({
  name,
  origin: `connorch/${name}`,
  ref: "main",
  pin: false,
  path: `~/clones/${name}`,
  expanded: `/Users/c/clones/${name}`,
  head,
  install: "pnpm install",
  files: {},
  outputs: [],
  decision,
});

const record = (commit: string) => ({ commit, path: "", install: "", files: {}, outputs: {} });

const state: MachineState = {
  ...emptyState,
  complete: true,
  vp: { version: "1.0.0" },
  node: "24.3.0",
  globals: [{ name: "vercel", version: "59.25.4" }],
  records: { t3code: record("3f1a2b0aa"), dotfiles: record("a41c0d2bb") },
};

const vpStep = { kind: "vp", from: "1.0.0", version: "1.1.0" } as const;
const plan = (name: string, over: Partial<MachinePlan>): MachinePlan => ({
  machine: { name, platform: "darwin" },
  vp: [],
  repos: [],
  questions: [],
  skipped: [],
  failures: [],
  ...over,
});
const upToDate = plan("studio", {
  repos: [repo("dotfiles", "a41c0d2bb", { run: false })],
});
const changes = plan("macbook", {
  vp: [vpStep],
  repos: [
    repo("t3code", "3f1a2b0aa", { run: true, reason: "new commit 3f1a2b0" }),
    repo("dotfiles", "a41c0d2bb", { run: false }),
  ],
});

describe("the Ledger", () => {
  it.effect("shows each Machine's changes, and every item in the full list", () =>
    Effect.gen(function* () {
      const { ledger, store } = yield* makeLedger({
        from: "studio",
        dryRun: false,
        machines: ["studio", "macbook", "homelab"],
        print: () => Effect.void,
      });
      const t3code = { fetch: stepId("t3code", "fetch"), install: stepId("t3code", "install") };
      yield* ledger.skip("homelab", "offline");
      yield* ledger.plan("studio", upToDate, state);
      yield* ledger.plan("macbook", changes, state);
      yield* ledger.start("studio");
      yield* ledger.start("macbook");
      for (const id of [CONFIG_STEP, vpStepId(vpStep)]) {
        yield* ledger.stepStarted("macbook", id);
        yield* TestClock.adjust("2 seconds");
        yield* ledger.stepDone("macbook", id, { ok: true });
      }
      yield* ledger.finish("studio", "ok");
      yield* ledger.stepStarted("macbook", t3code.fetch);
      yield* ledger.fetched("macbook", "t3code", "9e02bb1cc");
      yield* ledger.stepDone("macbook", t3code.fetch, { ok: true });
      yield* ledger.stepStarted("macbook", t3code.install);
      yield* TestClock.adjust("90 seconds");
      yield* ledger.stepDone("macbook", t3code.install, {
        ok: false,
        detail: "exit 1",
        output: ["ERR_PNPM_OUTDATED_LOCKFILE"],
      });
      yield* ledger.finish("macbook", "failed");
      const ended = yield* ledger.end;

      const text = (full: boolean) => ledgerText(ended, { full, now: store.get().now }, false);
      expect(text(false)).toBe(
        [
          "",
          "studio                                         up to date",
          "",
          "macbook                                1m 34s  1 of 2 done, 1 failed",
          "✓ done      vp      1.0.0 → 1.1.0        2.0s",
          "✗ failed    t3code  3f1a2b0 → 9e02bb1  1m 30s  exit 1",
          "            │ ERR_PNPM_OUTDATED_LOCKFILE",
          "",
          "homelab                                        – skipped  offline",
          "",
          "1 up to date, 1 failed, 1 skipped  in 1m 34s",
        ].join("\n"),
      );
      expect(text(true)).toContain(
        [
          "macbook                                  1m 34s  1 of 2 done, 1 failed",
          "✓ done      vp        1.0.0 → 1.1.0        2.0s",
          "            node      24.3.0",
          "            vercel    59.25.4",
          "✗ failed    t3code    3f1a2b0 → 9e02bb1  1m 30s  exit 1",
          "            │ ERR_PNPM_OUTDATED_LOCKFILE",
          "            dotfiles  a41c0d2                    up to date",
          "✓ copied    config                         2.0s",
        ].join("\n"),
      );
    }),
  );
});
