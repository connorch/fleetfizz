import { describe, expect, it } from "@effect/vitest";
import { renderToString } from "ink";

import type { Item, LedgerState, MachineEntry } from "./ledger.ts";
import { LedgerView, SPINNER, Styled } from "./view.tsx";

const item = (name: string, status: Item["status"]): Item => ({
  name,
  kind: "range",
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
    expect(lines.filter((l) => l.startsWith(`${SPINNER.frames[0]} running`))).toHaveLength(4);
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
});

describe("what the live Ledger says is running", () => {
  const spin = SPINNER.frames[0];
  const at = (machines: MachineEntry[], extra: Partial<LedgerState> = {}) =>
    live(40, { ...state, machines, ...extra }).map((l) => l.trimEnd());

  it("names each Machine's phase before it has items", () => {
    const lines = at([
      { name: "studio", status: "checking", items: [] },
      { name: "macbook", status: "checking", connected: true, items: [] },
      { name: "homelab", status: "waiting", checked: 300, items: [] },
      { name: "bluefin", status: "running", connected: false, started: 0, items: [] },
      { name: "pi", status: "running", connected: true, started: 0, items: [] },
    ]);
    expect(lines.filter((l) => /^\w/.test(l)).map((l) => l.replace(/\s+/g, " "))).toEqual([
      `studio 0.0s ${spin} connecting`,
      `macbook 0.0s ${spin} checking`,
      "homelab 0.3s ✓ checked",
      `bluefin 0.0s ${spin} connecting`,
      "pi 0.0s applying",
      "f full list · ctrl-c stop",
    ]);
  });

  it("shows an item that does not change while its Step runs", () => {
    const fetching: Item = {
      ...item("repos:vaut", "running"),
      kind: "record",
      changes: false,
      doing: "fetching",
      started: 0,
    };
    const lines = at([{ name: "macbook", status: "running", connected: true, items: [fetching] }]);
    expect(lines.some((l) => l.startsWith(`${spin} fetching`) && l.includes("repos:vaut"))).toBe(
      true,
    );
  });

  it("shows Resolve under the Machines while it runs", () => {
    const lines = at([{ name: "macbook", status: "waiting", items: [] }], {
      resolving: { started: 0, items: 12 },
    });
    expect(lines.find((l) => l.startsWith(`${spin} resolving`))?.replace(/\s+/g, " ")).toBe(
      `${spin} resolving versions and commits 12 items 0.0s`,
    );
  });
});

describe("the Ship's summary", () => {
  const planned = (name: string, changes: boolean): MachineEntry => ({
    name,
    status: "planned",
    items: [{ ...item("vp", "idle"), changes }],
  });
  const summary = (machines: MachineEntry[]) =>
    renderToString(
      <Styled color={false} live={false}>
        <LedgerView state={{ ...state, dryRun: true, machines, ended: 0 }} full={false} now={0} />
      </Styled>,
      { columns: 80 },
    )
      .split("\n")
      .at(-1);

  it("counts a dry run's Machines by what they would do", () => {
    expect(summary([planned("studio", false), planned("macbook", false)])).toBe("2 up to date");
    expect(summary([planned("studio", true), planned("macbook", false)])).toBe(
      "1 to change, 1 up to date",
    );
  });

  it("does not count a Machine that skipped an item as up to date", () => {
    const skipping = { ...planned("macbook", false), items: [item("vercel", "skipped")] };
    expect(summary([planned("studio", false), skipping])).toBe("1 up to date, 1 skipped");
  });
});
