import { describe, expect, it } from "@effect/vitest";

import { bumpedRange, bumpText } from "./bump.ts";

const text = `{
  // comment
  "vp": {
    "version": "1.1.0",
    "globals": { "vercel": "^59.25.4", "@posthog/cli": "^0.18.9" },
  },
}
`;

describe("bumpText", () => {
  it("changes only the one literal and keeps comments", () => {
    const result = bumpText(text, "vercel", "60.1.0");
    expect("text" in result && result.text).toBe(text.replace('"^59.25.4"', '"^60.1.0"'));
    expect("range" in result && result.range).toBe("^60.1.0");
  });

  it("keeps exact pins exact", () => {
    const result = bumpText(text, "vite-plus", "1.2.0");
    expect("text" in result && result.text).toBe(text.replace('"1.1.0"', '"1.2.0"'));
  });

  it("refuses when the Range is not a literal", () => {
    const result = bumpText(text, "node", "24.19.0");
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
