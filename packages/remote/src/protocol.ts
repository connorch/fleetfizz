// The line protocol between a generated script and fleetfizz. The script
// prints protocol lines that fleetfizz generated; everything else is captured
// output. A protocol line cut off in the middle (a dropped connection) counts
// as plain text, so its step counts as unfinished (ADR 0001).
import * as Schema from "effect/Schema";

import { Fact } from "@fleetfizz/core";

const StepStart = Schema.Struct({ id: Schema.String });
const StepDone = Schema.Struct({
  id: Schema.String,
  ok: Schema.Boolean,
  code: Schema.optionalKey(Schema.Number),
});
export type StepDone = typeof StepDone.Type;

export type Line =
  | { readonly kind: "state"; readonly fact: Fact }
  | { readonly kind: "step"; readonly id: string }
  | { readonly kind: "done"; readonly done: StepDone }
  | { readonly kind: "text"; readonly text: string };

const decodeFact = Schema.decodeUnknownResult(Schema.fromJsonString(Fact));
const decodeStart = Schema.decodeUnknownResult(Schema.fromJsonString(StepStart));
const decodeDone = Schema.decodeUnknownResult(Schema.fromJsonString(StepDone));

const STATE = "ff-state ";
const STEP = "ff-step ";
const DONE = "ff-done ";

export const parseLine = (line: string): Line => {
  if (line.startsWith(STATE)) {
    const result = decodeFact(line.slice(STATE.length));
    if (result._tag === "Success") return { kind: "state", fact: result.success };
  } else if (line.startsWith(STEP)) {
    const result = decodeStart(line.slice(STEP.length));
    if (result._tag === "Success") return { kind: "step", id: result.success.id };
  } else if (line.startsWith(DONE)) {
    const result = decodeDone(line.slice(DONE.length));
    if (result._tag === "Success") return { kind: "done", done: result.success };
  }
  return { kind: "text", text: line };
};

// The shell that prints a step marker. `ok` and `code` are shell expressions.
export const stepLine = (id: string): string => `printf 'ff-step {"id":"%s"}\\n' '${id}'`;
export const doneLine = (id: string, ok: boolean, code?: string): string =>
  code === undefined
    ? `printf 'ff-done {"id":"%s","ok":${ok}}\\n' '${id}'`
    : `printf 'ff-done {"id":"%s","ok":${ok},"code":%s}\\n' '${id}' "${code}"`;
