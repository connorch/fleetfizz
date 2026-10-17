import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { FleetConfig, isPin, Range, repoName } from "./schema.ts";

const decode = Schema.decodeUnknownResult(FleetConfig);
const ok = (input: unknown) => decode(input)._tag === "Success";

describe("FleetConfig", () => {
  it("accepts a full config", () => {
    expect(
      ok({
        $schema: "./schema.json",
        shippedAt: "2026-10-10T20:00:00.000Z",
        shippedFrom: "connors-mac-studio",
        shippedTo: { "connors-mac-studio": "2026-10-10T20:00:00.000Z" },
        machines: {
          "connors-mac-studio": { clones: "/Volumes/StudioStack SSD/fleetfizz/clones" },
          "connors-macbook-pro": {},
        },
        repos: [
          { origin: "connorch/skills", ref: "main", install: "pnpm install" },
          {
            origin: "kitlangton/psychopomp",
            ref: "b517dd423fd19282898c33e43acb8eb67546ebab",
            install: "cargo build --release",
            platforms: ["darwin"],
            outputs: ["~/.local/share/psychopomp"],
            files: { ".env": "A=1\n" },
          },
        ],
        vp: {
          version: "1.1.0",
          node: "24.18.1",
          dependsOn: [],
          globals: {
            vercel: "^59.25.4",
            skills: "*",
            wrangler: { range: "latest", machines: ["connors-mac-studio"] },
          },
        },
      }),
    ).toBe(true);
  });

  it("requires at least one Machine", () => {
    expect(ok({ machines: { "connors-mac-studio": {} } })).toBe(true);
    expect(ok({ machines: {} })).toBe(false);
    expect(ok({})).toBe(false);
  });

  it("rejects an origin that is not owner/repo", () => {
    expect(
      ok({
        machines: { a: {} },
        repos: [{ origin: "https://github.com/x/y", ref: "main", install: "x" }],
      }),
    ).toBe(false);
  });

  it("rejects an empty platforms list and an unknown platform", () => {
    expect(ok({ machines: { a: {} }, vp: { platforms: [] } })).toBe(false);
    expect(ok({ machines: { a: {} }, vp: { platforms: ["windows"] } })).toBe(false);
  });

  it("rejects Globals the vp section manages elsewhere", () => {
    for (const name of ["vp", "node", "vite-plus", "fleetfizz"]) {
      expect(ok({ machines: { a: {} }, vp: { globals: { [name]: "*" } } }), name).toBe(false);
    }
  });

  it("takes only * or latest for a Formula or Cask, and no Formula named brew", () => {
    expect(ok({ machines: { a: {} }, brew: { items: { gh: "*", tmux: "latest" } } })).toBe(true);
    expect(ok({ machines: { a: {} }, cask: { items: { ghostty: { range: "latest" } } } })).toBe(
      true,
    );
    expect(ok({ machines: { a: {} }, brew: { items: { gh: "^2.0.0" } } })).toBe(false);
    expect(ok({ machines: { a: {} }, brew: { items: { brew: "*" } } })).toBe(false);
  });

  it("rejects an unknown Provider in dependsOn", () => {
    expect(ok({ machines: { a: {} }, vp: { dependsOn: ["repos"] } })).toBe(true);
    expect(ok({ machines: { a: {} }, vp: { dependsOn: ["npm"] } })).toBe(false);
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

  it("defaults the repo name to owner-repo", () => {
    expect(repoName({ origin: "connorch/t3code" })).toBe("connorch-t3code");
    expect(repoName({ origin: "connorch/t3code", name: "t3" })).toBe("t3");
  });
});
