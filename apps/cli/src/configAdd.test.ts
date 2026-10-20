import { describe, expect, it } from "@effect/vitest";

import { fileEntry, fileName, parseSpec, rangeEntry, targetingOf } from "./configAdd.tsx";
import { pathOf } from "./configEdit.tsx";

describe("the entry an add writes", () => {
  it("is the shorthand without Targeting, and the object with it", () => {
    expect(rangeEntry("*", targetingOf({ platforms: [], machines: [] }))).toBe("*");
    expect(rangeEntry("*", targetingOf({ platforms: ["linux", "linux"], machines: [] }))).toEqual({
      range: "*",
      platforms: ["linux"],
    });
    expect(fileEntry("~/.zshrc", [], {})).toBe("~/.zshrc");
    expect(fileEntry("~/.config/k", ["backups"], {})).toEqual({
      path: "~/.config/k",
      exclude: ["backups"],
    });
  });
});

describe("parseSpec", () => {
  it("splits a Range off a package, scoped or not", () => {
    expect(parseSpec("vercel")).toEqual({ name: "vercel" });
    expect(parseSpec("vercel@^59")).toEqual({ name: "vercel", range: "^59" });
    expect(parseSpec("@posthog/cli")).toEqual({ name: "@posthog/cli" });
    expect(parseSpec("@posthog/cli@^0.18.9")).toEqual({ name: "@posthog/cli", range: "^0.18.9" });
  });
});

describe("fileName", () => {
  it("is the last segment without a leading dot, in a name's letters", () => {
    expect(fileName("~/.gitconfig")).toBe("gitconfig");
    expect(fileName("~/.config/karabiner/")).toBe("karabiner");
    expect(fileName("~/Library/Application Support")).toBe("Application-Support");
  });
});

describe("pathOf", () => {
  it("finds an Item in its section, and nothing for a Provider without one", () => {
    expect(pathOf("brew", "tmux")).toEqual(["brew", "items", "tmux"]);
    expect(pathOf("pnpm", "vercel")).toEqual(["pnpm", "items", "vercel"]);
    expect(pathOf("fleetfizz", "fleetfizz")).toBeUndefined();
    expect(pathOf("nope", "x")).toBeUndefined();
  });
});
