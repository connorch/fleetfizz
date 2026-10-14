import { parseConfig } from "@fleetfizz/config";
import * as Effect from "effect/Effect";
import { expect, it } from "@effect/vitest";
import { EXAMPLE, exampleText } from "./example-config";

// The page's example must be a config the CLI would load as written.
it("the example config parses as the CLI's config.jsonc", () => {
  const parsed = Effect.runSync(parseConfig("example", exampleText()));
  expect(parsed).toEqual(EXAMPLE);
});

it("the example reads as it did by hand", () => {
  expect(exampleText()).toMatchInlineSnapshot(`
    "{
      // The Fleet: every Machine a Ship touches.
      "machines": {
        "mac-studio": { "clones": "/Volumes/Stack/clones" },
        "macbook-pro": {},
        "homelab": {}
      },
      // Tracked Repos, installed from origin on every Machine.
      "repos": [
        {
          "origin": "connorch/t3code",
          "ref": "main",
          "platforms": ["darwin"],
          "install": "pnpm install && pnpm build",
          "outputs": ["~/Applications/T3 Code.app"]
        },
        { "origin": "connorch/dotfiles", "ref": "main", "install": "./install.sh" }
      ],
      // The vite-plus toolchain and its Globals.
      "vp": {
        "version": "1.1.0",
        "node": "24.18.1",
        "globals": { "vercel": "^59.25.4", "wrangler": "^4.136.3" }
      }
    }"
  `);
});
