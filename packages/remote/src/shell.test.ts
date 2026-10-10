import { describe, expect, it } from "@effect/vitest";

import { quote, quotePath } from "./shell.ts";

describe("quote", () => {
  it("single-quotes and escapes embedded quotes", () => {
    expect(quote("/Volumes/StudioStack SSD/fleet")).toBe("'/Volumes/StudioStack SSD/fleet'");
    expect(quote("it's")).toBe("'it'\\''s'");
  });
});

describe("quotePath", () => {
  it("expands a leading ~ on the remote and quotes the rest", () => {
    expect(quotePath("~")).toBe('"$HOME"');
    expect(quotePath("~/.local/share/fleet")).toBe("\"$HOME\"'/.local/share/fleet'");
    expect(quotePath("/abs/path")).toBe("'/abs/path'");
  });
});
