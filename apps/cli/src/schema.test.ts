import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { fleetConfigJsonSchema } from "@fleetfizz/config";

describe("fleet.schema.json", () => {
  it.effect("is current (run `pnpm schema` to regenerate)", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const checkedIn = yield* fs.readFileString(
        new URL("../fleet.schema.json", import.meta.url).pathname,
      );
      const parsed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
        checkedIn,
      );
      expect(parsed).toEqual(fleetConfigJsonSchema());
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
});
