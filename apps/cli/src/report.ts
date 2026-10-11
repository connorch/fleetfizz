// The last Ship's full Ledger, saved on the Starting Machine at the end of
// every Ship (not a dry run). `fizz report` prints it: every item on every
// Machine, with times and all FAIL output.
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { STATE_DIR } from "@fleetfizz/remote";

import { LedgerState, noteRow, printRows, rows } from "./ledger.ts";

const reportPath = () => `${STATE_DIR.replace(/^~/, process.env.HOME ?? "~")}/last-ship.json`;

const LedgerJson = Schema.fromJsonString(LedgerState);
const encode = Schema.encodeEffect(LedgerJson);
const decode = Schema.decodeEffect(LedgerJson);

export const saveReport = Effect.fn("saveReport")(function* (state: LedgerState) {
  const fs = yield* FileSystem.FileSystem;
  const path = reportPath();
  yield* fs.makeDirectory(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  yield* fs.writeFileString(path, yield* encode(state));
});

export const report = Effect.fn("report")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = reportPath();
  if (!(yield* fs.exists(path))) return yield* Console.log("no Ship from this Machine yet");
  const state = yield* decode(yield* fs.readFileString(path));
  const when = DateTime.formatLocal(DateTime.makeUnsafe(state.started), {
    dateStyle: "medium",
    timeStyle: "short",
  });
  yield* printRows([
    [{ text: `last Ship ${when} from ${state.from}`, style: "dim" }],
    ...state.notes.map(noteRow),
    ...rows(state, { full: true, now: state.ended ?? state.started, live: false }),
  ]);
});
