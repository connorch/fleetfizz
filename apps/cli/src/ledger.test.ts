import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import type { MachinePlan, ProviderPlan } from "@fleetfizz/core";
import { CONFIG_STEP } from "@fleetfizz/remote";

import { makeLedger } from "./ledger.ts";
import { ledgerText } from "./view.tsx";

const step = (id: string, item: string, doing: string) => ({ id, items: [item], doing, run: [] });

const vp = (decisions: ProviderPlan["decisions"]): ProviderPlan => ({
  name: "vp",
  rule: "range",
  dependsOn: [],
  decisions,
  steps: decisions.some((d) => d.kind === "change")
    ? [step("vp:vp:upgrade", "vp", "upgrading")]
    : [],
});
const repos = (decisions: ProviderPlan["decisions"]): ProviderPlan => ({
  name: "repos",
  rule: "record",
  dependsOn: ["vp"],
  decisions,
  steps: decisions.some((d) => d.kind === "change")
    ? [
        step("repos:t3code:fetch", "t3code", "fetching"),
        step("repos:t3code:install", "t3code", "installing"),
      ]
    : [],
});
const leaves = [
  { kind: "leave", item: "node", at: "24.3.0" },
  { kind: "leave", item: "vercel", at: "59.25.4" },
] as const;
const dotfiles = { kind: "leave", item: "dotfiles", at: "a41c0d2" } as const;

const plan = (name: string, providers: ReadonlyArray<ProviderPlan>): MachinePlan => ({
  machine: { name, platform: "darwin" },
  providers,
});
const upToDate = plan("studio", [
  vp([{ kind: "leave", item: "vp", at: "1.1.0" }]),
  repos([dotfiles]),
]);
const withUpkeep = (p: ProviderPlan): ProviderPlan => ({
  ...p,
  // An up-to-date clone's upkeep: its fetch alone.
  steps: [...p.steps, step("repos:dotfiles:fetch", "dotfiles", "fetching")],
});
const changes = plan("macbook", [
  vp([{ kind: "change", item: "vp", from: "1.0.0", to: "1.1.0", change: "1.1.0" }, ...leaves]),
  withUpkeep(
    repos([
      {
        kind: "change",
        item: "t3code",
        from: "3f1a2b0",
        to: "9e02bb1",
        reason: "new commit",
        change: undefined,
      },
      dotfiles,
    ]),
  ),
]);

describe("the Ledger", () => {
  it.effect("shows each Machine's changes, and every item in the full list", () =>
    Effect.gen(function* () {
      const { ledger, store } = yield* makeLedger({
        from: "studio",
        dryRun: false,
        machines: ["studio", "macbook", "homelab"],
        print: () => Effect.void,
      });
      yield* ledger.skip("homelab", "offline");
      yield* ledger.plan("studio", upToDate);
      yield* ledger.plan("macbook", changes);
      yield* ledger.start("studio");
      yield* ledger.start("macbook");
      for (const id of [CONFIG_STEP, "vp:vp:upgrade"]) {
        yield* ledger.stepStarted("macbook", id);
        yield* TestClock.adjust("2 seconds");
        yield* ledger.stepDone("macbook", id, { ok: true });
      }
      yield* ledger.finish("studio", "ok");
      yield* ledger.stepStarted("macbook", "repos:dotfiles:fetch");
      yield* ledger.stepDone("macbook", "repos:dotfiles:fetch", { ok: true });
      yield* ledger.stepStarted("macbook", "repos:t3code:fetch");
      yield* ledger.stepDone("macbook", "repos:t3code:fetch", { ok: true });
      yield* ledger.stepStarted("macbook", "repos:t3code:install");
      yield* TestClock.adjust("90 seconds");
      yield* ledger.stepDone("macbook", "repos:t3code:install", {
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
          "studio                                               up to date",
          "",
          "macbook                                      1m 34s  1 of 2 done, 1 failed",
          "✓ done      vp:vp         1.0.0 → 1.1.0        2.0s",
          "✗ failed    repos:t3code  3f1a2b0 → 9e02bb1  1m 30s  exit 1",
          "            │ ERR_PNPM_OUTDATED_LOCKFILE",
          "",
          "homelab                                              – skipped  offline",
          "",
          "1 up to date, 1 failed, 1 skipped  in 1m 34s",
        ].join("\n"),
      );
      expect(text(true)).toContain(
        [
          "macbook                                        1m 34s  1 of 2 done, 1 failed",
          "✓ done      vp:vp           1.0.0 → 1.1.0        2.0s",
          "            vp:node         24.3.0",
          "            vp:vercel       59.25.4",
          "✗ failed    repos:t3code    3f1a2b0 → 9e02bb1  1m 30s  exit 1",
          "            │ ERR_PNPM_OUTDATED_LOCKFILE",
          "            repos:dotfiles  a41c0d2              0.0s  up to date",
          "✓ copied    config                               2.0s",
        ].join("\n"),
      );
    }),
  );
});
