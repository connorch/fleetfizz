import { describe, expect, it } from "@effect/vitest";
import { renderToString } from "ink";

import type { Item, LedgerState, MachineEntry } from "./ledger.ts";
import { LedgerView, Styled } from "./view.tsx";

const item = (name: string, status: Item["status"]): Item => ({
  name,
  kind: "version",
  from: "1.0.0",
  to: "2.0.0",
  changes: true,
  status,
  steps: [],
});
const machine = (name: string, status: MachineEntry["status"], items: number): MachineEntry => ({
  name,
  status,
  items: Array.from({ length: items }, (_, n) =>
    item(`pkg-${n}`, status === "running" ? "running" : "ok"),
  ),
});
const state: LedgerState = {
  from: "studio",
  dryRun: false,
  notes: [],
  machines: [
    machine("studio", "ok", 6),
    machine("macbook", "running", 4),
    machine("homelab", "ok", 6),
  ],
  started: 0,
};

const live = (height: number, shown: LedgerState = state) =>
  renderToString(
    <Styled color={false} live>
      <LedgerView state={shown} full={false} now={0} height={height} />
    </Styled>,
    { columns: 80 },
  ).split("\n");

describe("the live Ledger", () => {
  it("fits the window, keeping the running Machine's lines", () => {
    const lines = live(12);
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines.filter((l) => l.startsWith("▸ running"))).toHaveLength(4);
    expect(lines.at(-1)).toContain("12 lines hidden to fit the window");
  });

  it("cuts the frame when even one line per Machine is too many", () => {
    const lines = live(5);
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines).toContain("…");
  });

  it("keeps every running Machine's own line when their items do not fit", () => {
    const busy: LedgerState = {
      ...state,
      machines: [machine("studio", "running", 8), machine("macbook", "running", 8)],
    };
    const lines = live(12, busy);
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines.filter((l) => l.startsWith("studio") || l.startsWith("macbook"))).toHaveLength(2);
  });

  it("draws nothing when there is no room", () => {
    expect(live(2)).toEqual([""]);
  });

  it("keeps the end of a failed Machine's output when it is cut", () => {
    const failed: LedgerState = {
      ...state,
      machines: [
        {
          name: "studio",
          status: "failed",
          items: [{ ...item("t3code", "failed"), output: ["first", "second", "third", "last"] }],
        },
      ],
    };
    const lines = live(6, failed);
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines.join("\n")).toContain("│ last");
    expect(lines.join("\n")).not.toContain("│ first");
  });

  it("keeps a failure's output over the items after it", () => {
    const failed: LedgerState = {
      ...state,
      machines: [
        {
          name: "studio",
          status: "failed",
          items: [
            { ...item("vp", "failed"), output: ["first", "second", "third", "last"] },
            item("t3code", "ok"),
            item("skills", "ok"),
          ],
        },
      ],
    };
    const lines = live(7, failed);
    expect(lines.length).toBeLessThanOrEqual(7);
    expect(lines.join("\n")).toContain("│ last");
    expect(lines.join("\n")).not.toContain("skills");
    expect(lines.filter((l) => l.trim() === "…")).toHaveLength(2);
  });

  it("keeps a failed item with no output over the items after it", () => {
    const failed: LedgerState = {
      ...state,
      machines: [
        {
          name: "studio",
          status: "failed",
          items: [
            item("a", "ok"),
            item("b", "ok"),
            { ...item("vp", "failed"), detail: "stopped" },
            item("t3code", "ok"),
            item("skills", "ok"),
          ],
        },
      ],
    };
    const lines = live(7, failed).join("\n");
    expect(lines).toContain("✗ failed");
    expect(lines).not.toContain("skills");
  });
});
