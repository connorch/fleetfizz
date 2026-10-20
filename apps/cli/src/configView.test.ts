import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { parseConfig } from "@fleetfizz/config";

import { changedLines, sectionsOf, shippedLine } from "./configView.tsx";

const config = Effect.runSync(
  parseConfig(
    "config.jsonc",
    JSON.stringify({
      version: "0.2.0",
      machines: ["studio", "macbook", "homelab"],
      vp: { items: { vercel: "^59.25.4" } },
      npm: { items: { pnpm: "^10" } },
      cask: { platforms: ["darwin"], items: { ghostty: "latest" } },
      brew: { items: { tmux: { range: "*", platforms: ["linux"] } } },
      skills: {
        agents: ["claude-code"],
        items: {
          grilling: "mattpocock/skills",
          "find-skills": { source: "vercel-labs/skills", ref: "v2" },
        },
      },
      files: {
        items: {
          vscode: [
            { platforms: ["darwin"], path: "~/Library/Application Support/Code/User" },
            { platforms: ["linux"], path: "~/.config/Code/User" },
          ],
        },
      },
    }),
  ),
);

describe("sectionsOf", () => {
  it("shows each section's Items, Targeting where it is written, and each Variant", () => {
    expect(sectionsOf(config)).toEqual([
      { provider: "vp", rows: [{ name: "vercel", wants: "^59.25.4" }] },
      { provider: "npm", rows: [{ name: "pnpm", wants: "^10" }] },
      { provider: "brew", rows: [{ name: "tmux", wants: "*", where: "linux" }] },
      { provider: "cask", where: "darwin", rows: [{ name: "ghostty", wants: "latest" }] },
      {
        provider: "skills",
        rows: [
          { name: "grilling", wants: "mattpocock/skills" },
          { name: "find-skills", wants: "vercel-labs/skills#v2" },
        ],
      },
      {
        provider: "files",
        rows: [
          {
            name: "vscode",
            variant: 0,
            wants: "~/Library/Application Support/Code/User",
            where: "darwin",
          },
          { name: "vscode", variant: 1, wants: "~/.config/Code/User", where: "linux" },
        ],
      },
    ]);
  });
});

describe("shippedLine", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");
  const record = {
    ship: "2026-10-19T10-00-00Z-studio",
    sha: "abc",
    reached: {
      studio: "2026-10-19T10:00:00.000Z",
      macbook: "2026-10-19T10:00:00.000Z",
      homelab: "2026-10-10T12:00:00.000Z",
    },
  };

  it("names the Machines the last Ship missed", () => {
    expect(shippedLine(record, ["studio", "macbook", "homelab", "air"], "abc", now)).toBe(
      "Last Ship 2h ago reached 2 of 4 Machines; homelab 9d ago, air never.",
    );
  });

  it("says when the config changed since", () => {
    expect(shippedLine(record, ["studio", "macbook"], "def", now)).toBe(
      "Last Ship 2h ago reached 2 of 2 Machines. Edited since.",
    );
  });

  it("says when no Ship has reached it", () => {
    expect(shippedLine(undefined, ["studio"], "abc", now)).toBe("No Ship has reached it yet.");
  });
});

describe("changedLines", () => {
  it("keeps three lines before a change and one after", () => {
    const before = ["a", "b", "c", "d", "e", "f"].join("\n");
    const after = ["a", "b", "c", "d", "x", "e", "f"].join("\n");
    expect(changedLines(before, after)).toEqual([
      { sign: " ", text: "b" },
      { sign: " ", text: "c" },
      { sign: " ", text: "d" },
      { sign: "+", text: "x" },
      { sign: " ", text: "e" },
    ]);
  });
});
