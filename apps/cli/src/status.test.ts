import { describe, expect, it } from "@effect/vitest";

import type { Item, MachineEntry } from "./ledger.ts";
import { cellOf, summaryOf } from "./status.tsx";

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
