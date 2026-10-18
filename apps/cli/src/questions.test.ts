import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { Question } from "@fleetfizz/core";

import { makeLedger } from "./ledger.ts";
import { askQuestions } from "./questions.ts";

// A "range" Question for vp:vercel above the Range at `path`.
const above = (found: string, path: ReadonlyArray<string | number>, range: string): Question => ({
  kind: "range",
  subject: "vp:vercel",
  found,
  problem: `is above ${range}`,
  choices: [{ value: "bump", title: "bump the config" }],
  default: "bump",
  bump: { path, range },
});

describe("askQuestions", () => {
  it.effect("asks once per subject, but bumps each Variant's Range to its own newest", () =>
    Effect.gen(function* () {
      const { ledger } = yield* makeLedger({
        from: "studio",
        dryRun: false,
        machines: ["studio", "macbook", "bluefin"],
        print: () => Effect.void,
      });
      const linux = ["vp", "items", "vercel", 0, "range"];
      const other = ["vp", "items", "vercel", 1, "range"];
      const answered = yield* askQuestions({
        asked: [
          { machine: "bluefin", question: above("11.0.0", linux, "^10.0.0") },
          { machine: "studio", question: above("2.1.0", other, "^1.0.0") },
          { machine: "macbook", question: above("2.3.0", other, "^1.0.0") },
        ],
        answer: () => "bump",
        ledger,
        ask: undefined,
        dryRun: false,
      });
      expect(answered).toHaveLength(1);
      expect(answered[0]?.bumps).toEqual([
        { path: linux, range: "^10.0.0", newest: "11.0.0" },
        { path: other, range: "^1.0.0", newest: "2.3.0" },
      ]);
    }),
  );
});
