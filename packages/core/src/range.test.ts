import { describe, expect, it } from "@effect/vitest";

import { decideRange } from "./range.ts";

const available = ["58.0.0", "59.25.4", "59.30.0", "60.1.0", "61.0.0-beta.1"];

// One case per row of the Range rules table (ADR 0006).
describe("decideRange", () => {
  it("installs the newest match when missing", () => {
    expect(decideRange("^59.25.4", undefined, available)).toEqual({
      kind: "install",
      version: "59.30.0",
    });
  });

  it("leaves a version inside the Range, even when a newer match exists", () => {
    expect(decideRange("^59.25.4", "59.25.4", available)).toEqual({ kind: "leave" });
  });

  it("installs the newest match when below the Range", () => {
    expect(decideRange("^59.25.4", "58.0.0", available)).toEqual({
      kind: "install",
      version: "59.30.0",
    });
  });

  it("asks when above the Range", () => {
    expect(decideRange("^59.25.4", "60.1.0", available)).toEqual({
      kind: "ask",
      installed: "60.1.0",
    });
  });

  it("latest always installs the newest stable version", () => {
    expect(decideRange("latest", "59.30.0", available)).toEqual({
      kind: "install",
      version: "60.1.0",
    });
    expect(decideRange("latest", "60.1.0", available)).toEqual({ kind: "leave" });
  });

  it("* installs when missing and never upgrades", () => {
    expect(decideRange("*", undefined, available)).toEqual({ kind: "install", version: "60.1.0" });
    expect(decideRange("*", "58.0.0", available)).toEqual({ kind: "leave" });
  });

  it("exact pins treat any newer version as above the Range", () => {
    expect(decideRange("1.1.0", "1.1.0", ["1.0.0", "1.1.0", "1.2.0"])).toEqual({ kind: "leave" });
    expect(decideRange("1.1.0", "1.2.0", ["1.0.0", "1.1.0", "1.2.0"])).toEqual({
      kind: "ask",
      installed: "1.2.0",
    });
    expect(decideRange("1.1.0", "1.0.0-rc.0", ["1.0.0", "1.1.0", "1.2.0"])).toEqual({
      kind: "install",
      version: "1.1.0",
    });
  });

  it("reports when nothing satisfies the Range", () => {
    expect(decideRange("^99.0.0", undefined, available)).toEqual({ kind: "unavailable" });
  });
});
