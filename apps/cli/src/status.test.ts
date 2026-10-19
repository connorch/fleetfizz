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
    item("vp:node"),
    item("vp:vercel", { changes: true, from: "1.0.0", to: "2.0.0" }),
    item("vp:mode", { status: "skipped", asked: true, detail: "system-first" }),
    item("brew:gh", { status: "failed", changes: true, detail: "no Homebrew" }),
    item("brew:jq", { status: "skipped", detail: "depends on vp" }),
  ]);

  it("tells each state apart", () => {
    expect(
      ["vp:node", "vp:vercel", "vp:mode", "brew:gh", "brew:jq", "cask:ghostty"].map(
        (a) => cellOf(m, a).glyph,
      ),
    ).toEqual(["✓", "↑", "?", "✗", "–", "·"]);
  });

  it("marks every Item on a Machine that was not checked", () => {
    expect(cellOf(machine([], { status: "skipped", detail: "offline" }), "vp:node").glyph).toBe(
      "○",
    );
  });
});

describe("summaryOf", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");

  it("counts what differs", () => {
    const m = machine([
      item("vp:vercel", { changes: true }),
      item("repos:t3code", { changes: true }),
      item("vp:mode", { status: "skipped", asked: true }),
    ]);
    expect(summaryOf(m, undefined, now)).toEqual({
      text: "2 to change · 1 Question",
      tone: "run",
    });
    expect(summaryOf(machine([item("vp:node")]), undefined, now)).toEqual({
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
        machines: ["studio", "air"],
        brew: { items: { gh: "*", tmux: { range: "*", machines: ["air"] } } },
      }),
    ),
  );

  it("keeps an Item only offline Machines get, and vp's Items without a vp section", () => {
    const state: LedgerState = {
      from: "studio",
      dryRun: true,
      notes: [],
      started: 0,
      machines: [
        machine([item("vp:vp"), item("vp:mode"), item("brew:gh"), item("config")], {
          name: "studio",
        }),
        machine([], { name: "air", status: "skipped", detail: "offline" }),
      ],
    };
    expect(rowsOf(state, config).map((s) => [s.provider, s.items.map((i) => i.name)])).toEqual([
      ["vp", ["vp", "mode"]],
      ["brew", ["gh", "tmux"]],
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
