import { describe, expect, it } from "@effect/vitest";

import { isNewer, stampText, staleCopies } from "./stamp.ts";

const stamp = {
  shippedAt: "2026-10-10T20:00:00.000Z",
  shippedFrom: "connors-mac-studio",
  reached: ["connors-mac-studio", "connors-macbook-pro"],
};

describe("stampText", () => {
  it("adds the stamp after $schema and keeps comments", () => {
    const text = `{
  // the schema
  "$schema": "./schema.json",
  "machines": { "connors-mac-studio": {} }, // the fleet
}
`;
    expect(stampText(text, stamp)).toBe(`{
  // the schema
  "$schema": "./schema.json",
  "shippedAt": "2026-10-10T20:00:00.000Z",
  "shippedFrom": "connors-mac-studio",
  "shippedTo": {
    "connors-mac-studio": "2026-10-10T20:00:00.000Z",
    "connors-macbook-pro": "2026-10-10T20:00:00.000Z"
  },
  "machines": { "connors-mac-studio": {} }, // the fleet
}
`);
  });

  it("replaces an existing stamp in place, keeps unreached Fleet Machines' entries, and drops removed Machines", () => {
    const text = `{
  "shippedAt": "2026-10-09T00:00:00.000Z",
  "shippedFrom": "connors-macbook-pro",
  "shippedTo": { "connors-macbook-pro": "2026-10-09T00:00:00.000Z", "bluefin": "2026-10-01T00:00:00.000Z" },
  "machines": { "connors-mac-studio": {}, "connors-macbook-pro": {} },
}`;
    const out = stampText(text, { ...stamp, reached: ["connors-mac-studio"] });
    expect(out).toContain(`"shippedAt": "2026-10-10T20:00:00.000Z"`);
    expect(out).toContain(`"shippedFrom": "connors-mac-studio"`);
    expect(out).toContain(`"connors-mac-studio": "2026-10-10T20:00:00.000Z"`);
    expect(out).toContain(`"connors-macbook-pro": "2026-10-09T00:00:00.000Z"`);
    expect(out).not.toContain("bluefin");
    expect(
      out.endsWith(`"machines": { "connors-mac-studio": {}, "connors-macbook-pro": {} },\n}`),
    ).toBe(true);
  });
});

describe("stampText's own Machine", () => {
  it("counts as reached even when the Ship did not target it", () => {
    const text = `{ "machines": { "connors-mac-studio": {}, "connors-macbook-pro": {} } }`;
    const out = stampText(text, {
      ...stamp,
      reached: ["connors-macbook-pro"],
      own: "connors-mac-studio",
    });
    expect(out).toContain(`"connors-mac-studio": "2026-10-10T20:00:00.000Z"`);
  });
});

describe("staleCopies", () => {
  const early = "2026-10-10T19:00:00.000Z";
  const late = "2026-10-10T20:00:00.000Z";
  const config = { shippedTo: { studio: late, macbook: early } };
  const copy = (machine: string, shippedTo: Record<string, string>) => ({
    machine,
    config: { shippedTo },
  });

  it("finds a Machine that received a config after this one last reached it", () => {
    const stale = staleCopies(config, [copy("macbook", { macbook: late })], "studio");
    expect(stale.map((c) => c.machine)).toEqual(["macbook"]);
  });

  it("compares each Machine only by its own entry", () => {
    // The macbook's copy is newer for the studio, but not for the macbook itself.
    const copies = [copy("macbook", { studio: "2026-10-11T00:00:00.000Z", macbook: early })];
    expect(staleCopies(config, copies, "studio")).toEqual([]);
  });

  it("never finds the Machine whose copy is being shipped, unless --config named another file", () => {
    const own = [copy("studio", { studio: "2026-10-11T00:00:00.000Z" })];
    expect(staleCopies(config, own, "studio")).toEqual([]);
    expect(staleCopies(config, own, undefined).map((c) => c.machine)).toEqual(["studio"]);
  });
});

describe("isNewer", () => {
  it("orders ISO stamps, and treats a missing stamp as oldest", () => {
    expect(isNewer("2026-10-10T20:00:00.000Z", "2026-10-10T19:00:00.000Z")).toBe(true);
    expect(isNewer("2026-10-10T19:00:00.000Z", "2026-10-10T20:00:00.000Z")).toBe(false);
    expect(isNewer("2026-10-10T19:00:00.000Z", undefined)).toBe(true);
    expect(isNewer(undefined, "2026-10-10T19:00:00.000Z")).toBe(false);
    expect(isNewer(undefined, undefined)).toBe(false);
  });
});
