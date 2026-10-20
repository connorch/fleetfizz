import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { parseConfig } from "@fleetfizz/config";

import { draftText } from "./init.tsx";
import { checksOf, type Facts } from "./prerequisites.ts";

describe("draftText", () => {
  it("writes a config that loads, laid out as the docs write one", () => {
    const text = draftText({
      version: "0.14.0",
      machines: ["studio", "macbook"],
      globals: [
        { pm: "pnpm", name: "vercel", version: "64.5.0" },
        { pm: "pnpm", name: "wrangler", version: "4.136.3" },
        { pm: "vp", name: "@posthog/cli", version: "0.18.9" },
      ],
      formulae: ["gh"],
      casks: [],
      files: ["~/.gitconfig"],
      linux: false,
    });
    expect(text).toBe(`{
  "$schema": "./schema.json",
  "version": "0.14.0",
  "machines": ["studio", "macbook"],
  "pnpm": { "items": { "vercel": "^64.5.0", "wrangler": "^4.136.3" } },
  "vp": { "items": { "@posthog/cli": "^0.18.9" } },
  "brew": { "items": { "gh": "*" } },
  "files": { "items": { "gitconfig": "~/.gitconfig" } },
}
`);
    expect(Effect.runSync(parseConfig("config.jsonc", text)).machines).toEqual([
      "studio",
      "macbook",
    ]);
  });
});

describe("draftText with a Linux Machine", () => {
  it("targets the cask section at darwin, since a Cask fails on Linux", () => {
    const text = draftText({
      version: "0.14.0",
      machines: ["studio", "homelab"],
      globals: [],
      formulae: [],
      casks: ["ghostty"],
      files: [],
      linux: true,
    });
    expect(text).toContain(`"cask": { "platforms": ["darwin"], "items": { "ghostty": "*" } },`);
  });
});

const ready: Facts = {
  platform: "darwin",
  tailscale: { app: false, state: "Running", ssh: true },
  brew: true,
  gh: "logged in",
};

const failing = (facts: Facts) =>
  checksOf(facts)
    .filter((c) => !c.ok)
    .map((c) => ({ required: c.required, fix: c.fix }));

describe("checksOf", () => {
  it("passes a Machine that is ready", () => {
    expect(failing(ready)).toEqual([]);
  });

  it("asks for Tailscale SSH, and for Homebrew's tailscaled instead of the app", () => {
    expect(failing({ ...ready, tailscale: { app: false, state: "Running", ssh: false } })).toEqual([
      { required: true, fix: "sudo tailscale set --ssh" },
    ]);
    expect(
      failing({ ...ready, tailscale: { app: true, state: "Running", ssh: false } })[0]?.fix,
    ).toContain("brew install --formula tailscale");
    expect(
      failing({ ...ready, tailscale: { app: false, state: "NeedsLogin", ssh: false } }),
    ).toEqual([{ required: true, fix: "sudo tailscale up" }]);
    expect(failing({ ...ready, tailscale: { app: false, state: undefined, ssh: false } })).toEqual([
      { required: true, fix: "sudo brew services start tailscale && sudo tailscale up" },
    ]);
  });

  it("requires Homebrew first when the Mac's Tailscale fix needs it", () => {
    expect(failing({ ...ready, brew: false, tailscale: undefined }).map((c) => c.required)).toEqual(
      [true, true],
    );
    expect(failing({ ...ready, brew: false, tailscale: undefined })[0]?.fix).toContain(
      "Homebrew/install",
    );
  });

  it("only warns about gh and Homebrew", () => {
    expect(failing({ ...ready, gh: "logged out", brew: false }).map((c) => c.required)).toEqual([
      false,
      false,
    ]);
    expect(failing({ ...ready, platform: "linux", gh: "missing", brew: false })).toEqual([
      { required: false, fix: "install gh from https://cli.github.com, then gh auth login" },
    ]);
  });
});
