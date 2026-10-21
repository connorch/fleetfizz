// The Starting Machine's own copy of the Config's Install Record (ADR 0008),
// read and written here directly: a Ship writes it whether or not it targets
// this Machine, and `fizz logs` reads it to find the last Ship that reached it.
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";

import { decodeConfigRecordJson } from "@fleetfizz/config";
import { CONFIG_RECORD } from "@fleetfizz/remote";

import { makeStateDirectory } from "./stateDirectory.ts";

const recordPath = () => CONFIG_RECORD.replace(/^~/, process.env.HOME ?? "~");

// The record, or undefined when there is none or it does not decode.
export const readConfigRecord = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(recordPath()).pipe(Effect.option);
  return Option.getOrUndefined(Option.flatMap(text, decodeConfigRecordJson));
});

// Writes `json`, an encoded record, atomically.
export const writeConfigRecord = Effect.fn("writeConfigRecord")(function* (json: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = recordPath();
  yield* makeStateDirectory(path.slice(0, path.lastIndexOf("/")));
  yield* fs.writeFileString(`${path}.tmp`, `${json}\n`);
  yield* fs.rename(`${path}.tmp`, path);
});
