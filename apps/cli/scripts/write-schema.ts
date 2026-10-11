// Writes apps/cli/schema.json from the FleetConfig Schema. `pnpm schema`.
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { fleetConfigJsonSchema } from "@fleetfizz/config";

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = new URL("../schema.json", import.meta.url).pathname;
  yield* fs.writeFileString(path, `${JSON.stringify(fleetConfigJsonSchema(), null, 2)}\n`);
  yield* Effect.log(`wrote ${path}`);
});

program.pipe(Effect.provide(NodeFileSystem.layer), NodeRuntime.runMain);
