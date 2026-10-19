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
      const { ledger, store } = yield* makeLedger({
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
        diff: () => Effect.void,
        dryRun: false,
      });
      expect(answered).toHaveLength(1);
      expect(answered[0]?.bumps).toEqual([
        { path: linux, range: "^10.0.0", newest: "11.0.0" },
        { path: other, range: "^1.0.0", newest: "2.3.0" },
      ]);
      expect(store.get().state.notes[0]?.text).toBe(
        "vp:vercel 11.0.0 on bluefin is above ^10.0.0; 2.1.0 on studio, 2.3.0 on macbook is above ^1.0.0",
      );
    }),
  );

  it.effect("shows a diff choice, then asks again; the diff is never the answer", () =>
    Effect.gen(function* () {
      const { ledger } = yield* makeLedger({
        from: "studio",
        dryRun: false,
        machines: ["studio", "macbook"],
        print: () => Effect.void,
      });
      const question: Question = {
        kind: "file",
        subject: "files:karabiner",
        found: "3eca7d1",
        problem: "differs, and no Ship wrote it",
        choices: [
          { value: "overwrite", title: "overwrite it" },
          { value: "skip", title: "skip" },
        ],
        default: "skip",
        diffs: [{ value: "diff:macbook", title: "view the diff" }],
      };
      const offered: string[][] = [];
      const picks = ["diff:macbook", "overwrite"];
      const shown: string[] = [];
      const answered = yield* askQuestions({
        asked: [{ machine: "macbook", question }],
        answer: () => undefined,
        ledger,
        ask: (choices) =>
          Effect.suspend(() => {
            offered.push(choices.map((c) => c.title));
            const pick = picks.shift();
            const choice = choices.find((c) => c.value === pick);
            return choice === undefined
              ? Effect.die("no such choice")
              : Effect.succeed(choice.value);
          }),
        diff: (_, choice) => Effect.sync(() => void shown.push(choice)),
        dryRun: false,
      });
      expect(shown).toEqual(["diff:macbook"]);
      expect(offered).toEqual([
        ["overwrite it", "skip", "view the diff"],
        ["overwrite it", "skip", "view the diff"],
      ]);
      expect(answered.map((a) => a.answer)).toEqual(["overwrite"]);
    }),
  );
});
