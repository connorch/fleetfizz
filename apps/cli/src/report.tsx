// The last Ship's full Ledger, saved on the Starting Machine at the end of
// every Ship (not a dry run). `fizz report` prints it: every item on every
// Machine, with times and all FAIL output.
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { STATE_DIR } from "@fleetfizz/remote";

import { Box } from "ink";

import { LedgerState } from "./ledger.ts";
import { LedgerView, NoteLine, T, toText } from "./view.tsx";

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
  // A report saved by another fleetfizz version may not decode; the next
  // Ship replaces it.
  const decoded = yield* decode(yield* fs.readFileString(path)).pipe(Effect.option);
  if (Option.isNone(decoded)) {
    return yield* Console.log(
      `the last report (${path}) is from another version of fleetfizz; the next Ship replaces it`,
    );
  }
  const state = decoded.value;
  const when = DateTime.formatLocal(DateTime.makeUnsafe(state.started), {
    dateStyle: "medium",
    timeStyle: "short",
  });
  yield* Console.log(
    toText(
      <Box flexDirection="column">
        <T tone="dim">{`last Ship ${when} from ${state.from}`}</T>
        {state.notes.map((note, i) => (
          <NoteLine key={i} note={note} />
        ))}
        <LedgerView state={state} full now={state.ended ?? state.started} />
      </Box>,
    ),
  );
});
