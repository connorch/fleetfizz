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

const live = (height: number) =>
  renderToString(
    <Styled color={false} live>
      <LedgerView state={state} full={false} now={0} height={height} />
    </Styled>,
    { columns: 80 },
  ).split("\n");

describe("the live Ledger", () => {
  it("fits the window, keeping the running Machine's lines", () => {
    const lines = live(12);
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines.filter((l) => l.startsWith("    pkg-"))).toHaveLength(4);
    expect(lines.at(-1)).toContain("12 lines hidden to fit the window");
  });

  it("cuts the frame when even one line per Machine is too many", () => {
    const lines = live(5);
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines).toContain("…");
  });
});
