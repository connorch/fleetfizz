import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { parseConfig } from "@fleetfizz/config";

import { itemsOf, type Item, type LedgerState, type MachineEntry } from "./ledger.ts";
import { cellOf, rowsOf, summaryOf } from "./status.tsx";

const item = (name: string, change: Partial<Item> = {}): Item => ({
  name,
  kind: "range",
  changes: false,
  status: "idle",
  steps: [],
  ...change,
});
const machine = (items: ReadonlyArray<Item>, change: Partial<MachineEntry> = {}): MachineEntry => ({
  name: "macbook",
  status: "planned",
  items,
  ...change,
});

describe("cellOf", () => {
  const m = machine([
    item("pnpm:turbo"),
    item("pnpm:vercel", { changes: true, from: "1.0.0", to: "2.0.0" }),
    item("files:zshrc", { status: "skipped", asked: true, detail: "was edited there" }),
    item("brew:gh", { status: "failed", changes: true, detail: "no Homebrew" }),
    item("brew:jq", { status: "skipped", detail: "depends on pnpm" }),
  ]);

  it("tells each state apart", () => {
    expect(
      ["pnpm:turbo", "pnpm:vercel", "files:zshrc", "brew:gh", "brew:jq", "cask:ghostty"].map(
        (a) => cellOf(m, a).glyph,
      ),
    ).toEqual(["✓", "↑", "?", "✗", "–", "·"]);
  });

  it("marks every Item on a Machine that was not checked", () => {
    expect(cellOf(machine([], { status: "skipped", detail: "offline" }), "pnpm:turbo").glyph).toBe(
      "○",
    );
  });
});

describe("summaryOf", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");

  it("counts what differs", () => {
    const m = machine([
      item("pnpm:vercel", { changes: true }),
      item("repos:t3code", { changes: true }),
      item("files:zshrc", { status: "skipped", asked: true }),
    ]);
    expect(summaryOf(m, undefined, now)).toEqual({
      text: "2 to change · 1 Question",
      tone: "run",
    });
    expect(summaryOf(machine([item("pnpm:turbo")]), undefined, now)).toEqual({
      text: "in line",
      tone: "ok",
    });
  });

  it("says when a skipped Machine was last reached", () => {
    const record = {
      ship: "s",
      sha: "x",
      reached: { macbook: "2026-10-10T12:00:00.000Z" },
    };
    expect(summaryOf(machine([], { status: "skipped", detail: "offline" }), record, now).text).toBe(
      "offline · last reached 9d ago",
    );
  });
});

describe("rowsOf", () => {
  const config = Effect.runSync(
    parseConfig(
      "config.jsonc",
      JSON.stringify({
        version: "0.2.0",
        machines: ["studio", "air"],
        brew: { items: { gh: "*", tmux: { range: "*", machines: ["air"] } } },
      }),
    ),
  );

  it("keeps an Item only offline Machines get, and implicit Items, fleetfizz's last", () => {
    const state: LedgerState = {
      from: "studio",
      dryRun: true,
      notes: [],
      started: 0,
      machines: [
        machine([item("fleetfizz:fleetfizz"), item("brew:brew"), item("brew:gh"), item("config")], {
          name: "studio",
        }),
        machine([], { name: "air", status: "skipped", detail: "offline" }),
      ],
    };
    expect(rowsOf(state, config).map((s) => [s.provider, s.items.map((i) => i.name)])).toEqual([
      ["brew", ["gh", "tmux", "brew"]],
      ["fleetfizz", ["fleetfizz"]],
    ]);
  });
});

describe("a Stale Config in a dry run", () => {
  it("is a Question, not a change", () => {
    const [config] = itemsOf(
      { machine: { name: "macbook", platform: "darwin" }, providers: [] },
      { from: "a1b2c3d", to: "9f8e7d6", asked: "edited there" },
    );
    expect(config).toMatchObject({
      name: "config",
      changes: false,
      status: "skipped",
      asked: true,
    });
    expect(cellOf(machine(config === undefined ? [] : [config]), "config").glyph).toBe("?");
  });
});
