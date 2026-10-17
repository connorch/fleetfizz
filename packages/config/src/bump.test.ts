import { describe, expect, it } from "@effect/vitest";

import { bumpedRange, bumpText } from "./bump.ts";

const text = `{
  // comment
  "vp": {
    "version": "1.1.0",
    "globals": {
      "vercel": "^59.25.4",
      "wrangler": { "range": "^4.0.0", "machines": ["a"] },
    },
  },
}
`;

describe("bumpText", () => {
  it("changes only the one literal and keeps comments", () => {
    const result = bumpText(text, ["vp", "globals", "vercel"], "60.1.0");
    expect("text" in result && result.text).toBe(text.replace('"^59.25.4"', '"^60.1.0"'));
    expect("range" in result && result.range).toBe("^60.1.0");
  });

  it("keeps exact pins exact", () => {
    const result = bumpText(text, ["vp", "version"], "1.2.0");
    expect("text" in result && result.text).toBe(text.replace('"1.1.0"', '"1.2.0"'));
  });

  it("bumps a Global with its own Targeting", () => {
    const result = bumpText(text, ["vp", "globals", "wrangler", "range"], "5.0.0");
    expect("text" in result && result.text).toBe(text.replace('"^4.0.0"', '"^5.0.0"'));
  });

  it("refuses when the Range is not a literal", () => {
    const result = bumpText(text, ["vp", "node"], "24.19.0");
    expect("reason" in result && result.reason).toContain("vp.node");
  });
});

describe("bumpedRange", () => {
  it("carets ranges and keeps pins", () => {
    expect(bumpedRange("^59.25.4", "60.1.0")).toBe("^60.1.0");
    expect(bumpedRange("*", "60.1.0")).toBe("^60.1.0");
    expect(bumpedRange("1.1.0", "1.2.0")).toBe("1.2.0");
  });
});
