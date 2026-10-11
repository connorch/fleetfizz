import { describe, expect, it } from "@effect/vitest";

import { isNewer, stampText } from "./stamp.ts";

const stamp = { shippedAt: "2026-10-10T20:00:00.000Z", shippedFrom: "connors-mac-studio" };

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
  "machines": { "connors-mac-studio": {} }, // the fleet
}
`);
  });

  it("replaces an existing stamp in place", () => {
    const text = `{
  "shippedAt": "2026-10-09T00:00:00.000Z",
  "shippedFrom": "connors-macbook-pro",
  "machines": { "connors-mac-studio": {} },
}`;
    expect(stampText(text, stamp)).toBe(`{
  "shippedAt": "2026-10-10T20:00:00.000Z",
  "shippedFrom": "connors-mac-studio",
  "machines": { "connors-mac-studio": {} },
}`);
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
