// Questions the Plan cannot answer alone, asked in the live Ledger on the
// Starting Machine, once per kind and subject however many Machines ask.
// `--answer` answers them in advance; without a terminal, each takes its
// default (ADR 0006).
import * as Effect from "effect/Effect";

import { bumpedRange } from "@fleetfizz/config";
import { isQuestionKind, QUESTION_CHOICES, type Context, type Question } from "@fleetfizz/core";

import type { Ledger } from "./ledger.ts";
import type { Live } from "./live.tsx";

// `--answer` entries: `kind=choice` for every Question of a kind, or
// `kind:subject=choice` for one (`range:pnpm:vercel=downgrade`). The more
// specific answer wins.
export const parseAnswers = (
  raw: ReadonlyArray<string>,
): { readonly answer: Context["answer"] } | { readonly invalid: string } => {
  const given = new Map<string, string>();
  for (const entry of raw) {
    const at = entry.lastIndexOf("=");
    const key = entry.slice(0, at);
    const choice = entry.slice(at + 1);
    const kind = key.split(":")[0] ?? "";
    if (at <= 0 || !isQuestionKind(kind)) {
      return {
        invalid: `--answer ${entry}: expected kind=choice or kind:subject=choice, kind one of ${Object.keys(QUESTION_CHOICES).join(", ")}`,
      };
    }
    const choices: ReadonlyArray<string> = QUESTION_CHOICES[kind];
    if (!choices.includes(choice)) {
      return { invalid: `--answer ${entry}: ${kind} takes ${choices.join(", ")}` };
    }
    given.set(key, choice);
  }
  return { answer: (kind, subject) => given.get(`${kind}:${subject}`) ?? given.get(kind) };
};

export interface Asked {
  readonly machine: string;
  readonly question: Question;
}

// One edit a "bump" answer makes: a Range, and the newest version found
// under it, which it adopts.
export interface Bump {
  readonly path: ReadonlyArray<string | number>;
  readonly range: string;
  readonly newest: string;
}

export interface Answered {
  readonly question: Question;
  readonly machines: ReadonlyArray<string>;
  // One per Range the Machines were asked about: Machines that got different
  // Variants of one Item each bump their own Variant's Range.
  readonly bumps: ReadonlyArray<Bump>;
  readonly answer: string;
}

const newestOf = (found: ReadonlyArray<string>): string =>
  found.toSorted((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] ?? "";

// Notes each Question, then answers it: in advance, live, or by its default.
// A dry run only notes them.
export const askQuestions = Effect.fn("askQuestions")(function* <R>(input: {
  readonly asked: ReadonlyArray<Asked>;
  readonly answer: Context["answer"];
  readonly ledger: Ledger;
  readonly ask: Live["ask"];
  // Shows a Question's diff choice, then the Question is asked again.
  readonly diff: (question: Question, choice: string) => Effect.Effect<void, never, R>;
  readonly dryRun: boolean;
}) {
  const groups = Map.groupBy(input.asked, (a) => `${a.question.kind}:${a.question.subject}`);
  const answered: Answered[] = [];
  for (const group of groups.values()) {
    const question = group[0]?.question;
    if (question === undefined) continue;
    const bumps = [
      ...Map.groupBy(
        group.flatMap(({ question: q }) =>
          q.bump === undefined ? [] : [{ ...q.bump, found: q.found }],
        ),
        (bump) => JSON.stringify(bump.path),
      ).values(),
    ].flatMap((list): Bump[] => {
      const first = list[0];
      return first === undefined
        ? []
        : [{ path: first.path, range: first.range, newest: newestOf(list.map((b) => b.found)) }];
    });
    // Machines on different Variants can be wrong in different ways ("is above ^1", "is above ^10").
    const where = [...Map.groupBy(group, (a) => a.question.problem)]
      .map(
        ([problem, list]) =>
          `${list.map((a) => `${a.question.found} on ${a.machine}`).join(", ")} ${problem}`,
      )
      .join("; ");
    yield* input.ledger.note("ask", `${question.subject} ${where}`);
    if (input.dryRun) {
      yield* input.ledger.note("answer", "not asked (dry run)");
      continue;
    }
    // Machines can offer different choices (pull this Machine's copy), so
    // the group offers each one once, in the order first seen.
    const offered = [
      ...new Map(group.flatMap((a) => a.question.choices).map((c) => [c.value, c])).values(),
    ];
    const choices = offered.map((c) => ({
      value: c.value,
      title:
        c.value === "bump" && bumps.length > 0
          ? `bump the config to ${bumps.map((b) => bumpedRange(b.range, b.newest)).join(" and ")}`
          : c.title,
    }));
    // Diff choices come last, so the first answer stays where the cursor starts.
    const diffs = [
      ...new Map(group.flatMap((a) => a.question.diffs ?? []).map((c) => [c.value, c])).values(),
    ];
    const isDiff = (value: string) => diffs.some((d) => d.value === value);
    let answer = input.answer(question.kind, question.subject);
    while (answer === undefined) {
      const picked =
        input.ask === undefined ? question.default : yield* input.ask([...choices, ...diffs]);
      if (isDiff(picked)) yield* input.diff(question, picked);
      else answer = picked;
    }
    yield* input.ledger.note("answer", choices.find((c) => c.value === answer)?.title ?? answer);
    answered.push({ question, machines: group.map((a) => a.machine), bumps, answer });
  }
  return answered;
});
