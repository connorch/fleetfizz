import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { FleetConfig, isPin, Range } from "./schema.ts";

const decode = Schema.decodeUnknownResult(FleetConfig);
// Every config but the version tests' names the same version.
const ok = (input: object) => decode({ version: "0.2.0", ...input })._tag === "Success";

describe("FleetConfig", () => {
  it("accepts a full config", () => {
    expect(
      ok({
        $schema: "./schema.json",
        machines: ["connors-mac-studio", "connors-macbook-pro"],
        shell: { init: [{ machines: ["connors-mac-studio"], command: "source ~/.zshrc" }] },
        repos: {
          dependsOn: ["brew"],
          cloneRoot: [
            { machines: ["connors-mac-studio"], path: "/Volumes/StudioStack SSD/fleetfizz/clones" },
          ],
          items: {
            skills: { origin: "connorch/skills", ref: "main", install: "pnpm install" },
            psychopomp: {
              origin: "kitlangton/psychopomp",
              ref: "b517dd423fd19282898c33e43acb8eb67546ebab",
              install: "cargo build --release",
              platforms: ["darwin"],
              outputs: ["~/.local/share/psychopomp"],
            },
          },
        },
        npm: { items: { pnpm: "^10" } },
        pnpm: {
          dependsOn: ["npm"],
          items: {
            vercel: "^59.25.4",
            skills: "*",
            wrangler: { range: "latest", machines: ["connors-mac-studio"] },
          },
        },
      }),
    ).toBe(true);
  });

  it("requires at least one Machine", () => {
    expect(ok({ machines: ["connors-mac-studio"] })).toBe(true);
    expect(ok({ machines: [] })).toBe(false);
    expect(ok({})).toBe(false);
  });

  it("lists each Machine once", () => {
    expect(ok({ machines: ["a", "a"] })).toBe(false);
  });

  it("decodes a shorthand to its full entry, alone or as a Variant", () => {
    const decoded = Schema.decodeSync(FleetConfig)({
      version: "0.2.0",
      machines: ["a"],
      repos: { cloneRoot: "~/code" },
      vp: {
        items: { vercel: "^59.25.4", wrangler: [{ platforms: ["linux"], range: "4.0.0" }, "*"] },
      },
      brew: { items: { gh: "*" } },
    });
    expect(decoded.repos?.cloneRoot).toEqual({ path: "~/code" });
    expect(decoded.vp?.items).toEqual({
      vercel: { range: "^59.25.4" },
      wrangler: [{ platforms: ["linux"], range: "4.0.0" }, { range: "*" }],
    });
    expect(decoded.brew?.items).toEqual({ gh: { range: "*" } });
  });

  it("encodes a targeted entry with its Targeting", () => {
    const written = {
      version: "0.2.0",
      machines: ["a"],
      vp: { items: { wrangler: { range: "^4.0.0", machines: ["a"] } } },
    } as const;
    const decoded = Schema.decodeSync(FleetConfig)(written);
    expect(Schema.encodeSync(FleetConfig)(decoded)).toEqual(written);
  });

  it("rejects an empty Variant list", () => {
    expect(ok({ machines: ["a"], vp: { items: { vercel: [] } } })).toBe(false);
  });

  it("rejects an origin that is not owner/repo", () => {
    expect(
      ok({
        machines: ["a"],
        repos: { items: { y: { origin: "https://github.com/x/y", ref: "main", install: "x" } } },
      }),
    ).toBe(false);
  });

  it("rejects an empty platforms list and an unknown platform", () => {
    expect(ok({ machines: ["a"], vp: { platforms: [] } })).toBe(false);
    expect(ok({ machines: ["a"], vp: { platforms: ["windows"] } })).toBe(false);
  });

  it("takes an exact version only", () => {
    expect(decode({ version: "0.13.0", machines: ["a"] })._tag).toBe("Success");
    for (const version of ["^0.13.0", "0.13", "latest", undefined])
      expect(decode({ version, machines: ["a"] })._tag, String(version)).toBe("Failure");
  });

  it("rejects fleetfizz as a Global: the config's version sets it", () => {
    for (const pm of ["vp", "npm", "bun", "pnpm"]) {
      expect(ok({ machines: ["a"], [pm]: { items: { fleetfizz: "*" } } }), pm).toBe(false);
      expect(ok({ machines: ["a"], [pm]: { items: { pnpm: "^10", node: "*" } } }), pm).toBe(true);
    }
  });

  it("takes only * or latest for a Formula or Cask, and no Formula named brew", () => {
    expect(ok({ machines: ["a"], brew: { items: { gh: "*", tmux: "latest" } } })).toBe(true);
    expect(ok({ machines: ["a"], cask: { items: { ghostty: { range: "latest" } } } })).toBe(true);
    expect(ok({ machines: ["a"], brew: { items: { gh: "^2.0.0" } } })).toBe(false);
    expect(ok({ machines: ["a"], brew: { items: { brew: "*" } } })).toBe(false);
  });

  it("takes Shared File names of safe characters, and one exclude across Variants", () => {
    const files = (items: unknown) => ok({ machines: ["a"], files: { items } });
    expect(files({ "editor.settings": "~/.config/editor" })).toBe(true);
    expect(files({ mise: { path: "~/.config/mise/config.toml", after: "mise install" } })).toBe(
      true,
    );
    for (const name of ["editor/settings", "..", ".", "Connor's"])
      expect(files({ [name]: "~/x" }), name).toBe(false);
    const variant = (platform: string, exclude?: string[]) => ({
      platforms: [platform],
      path: "~/x",
      ...(exclude === undefined ? {} : { exclude }),
    });
    expect(files({ x: [variant("darwin", ["a", "b"]), variant("linux", ["b", "a"])] })).toBe(true);
    expect(files({ x: [variant("darwin", ["backups"]), variant("linux")] })).toBe(false);
    for (const path of ["~/.config", "~/.config/fleetfizz/", "~/.local/state/fleetfizz/x", "~"])
      expect(files({ x: path }), path).toBe(false);
  });

  it("requires the agents for skills, and one ref per skill", () => {
    const skills = (section: unknown) => ok({ machines: ["a"], skills: section });
    expect(
      skills({
        agents: ["claude-code", "codex"],
        items: {
          grilling: "mattpocock/skills",
          pinned: "mattpocock/skills#main",
          "find-skills": { source: "vercel-labs/skills", ref: "v2", agents: ["claude-code"] },
        },
      }),
    ).toBe(true);
    expect(skills({ items: { grilling: "mattpocock/skills" } })).toBe(false);
    expect(skills({ agents: [], items: {} })).toBe(false);
    expect(
      skills({ agents: ["codex"], items: { x: { source: "mattpocock/skills#main", ref: "v2" } } }),
    ).toBe(false);
    for (const name of ["a/b", "..", "Connor's"])
      expect(skills({ agents: ["codex"], items: { [name]: "o/r" } }), name).toBe(false);
  });

  it("rejects an unknown Provider in dependsOn", () => {
    expect(ok({ machines: ["a"], vp: { dependsOn: ["repos", "npm"] } })).toBe(true);
    // fleetfizz has no section, and nothing waits for it.
    for (const name of ["yarn", "fleetfizz"])
      expect(ok({ machines: ["a"], vp: { dependsOn: [name] } }), name).toBe(false);
  });

  it("validates Ranges", () => {
    const range = Schema.decodeUnknownResult(Range);
    for (const good of ["^59.25.4", "1.2.3", "*", "latest", ">=1 <2"]) {
      expect(range(good)._tag, good).toBe("Success");
    }
    for (const bad of ["", "newest", "1.2.3.4"]) {
      expect(range(bad)._tag, bad).toBe("Failure");
    }
  });

  it("classifies a 40-character SHA as a Pin", () => {
    expect(isPin("b517dd423fd19282898c33e43acb8eb67546ebab")).toBe(true);
    expect(isPin("main")).toBe(false);
    expect(isPin("b517dd4")).toBe(false);
  });
});
