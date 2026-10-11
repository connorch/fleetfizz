import { describe, expect, it } from "@effect/vitest";

import { isNewer, stampText } from "./stamp.ts";

const stamp = {
  shippedAt: "2026-10-10T20:00:00.000Z",
  shippedFrom: "connors-mac-studio",
  reached: ["connors-mac-studio", "connors-macbook-pro"],
};

describe("stampText", () => {
  it("adds the stamp after $schema and keeps comments", () => {
    const text = `{
  // the schema
  "$schema": "./fleet.schema.json",
  "machines": { "connors-mac-studio": {} }, // the fleet
}
`;
    expect(stampText(text, stamp)).toBe(`{
  // the schema
  "$schema": "./fleet.schema.json",
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

describe("isNewer", () => {
  it("orders ISO stamps, and treats a missing stamp as oldest", () => {
    expect(isNewer("2026-10-10T20:00:00.000Z", "2026-10-10T19:00:00.000Z")).toBe(true);
    expect(isNewer("2026-10-10T19:00:00.000Z", "2026-10-10T20:00:00.000Z")).toBe(false);
    expect(isNewer("2026-10-10T19:00:00.000Z", undefined)).toBe(true);
    expect(isNewer(undefined, "2026-10-10T19:00:00.000Z")).toBe(false);
    expect(isNewer(undefined, undefined)).toBe(false);
  });
});
