import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { reference } from "./reference.ts";

const generated = new URL("../../website/content/generated/", import.meta.url);

describe("the docs' generated reference", async () => {
  const files = await Effect.runPromise(reference);
  for (const [path, markdown] of Object.entries(files)) {
    it(`${path} is current (run \`pnpm test -u\` in apps/cli to regenerate)`, async () => {
      await expect(markdown).toMatchFileSnapshot(new URL(path, generated).pathname);
    });
  }
});
