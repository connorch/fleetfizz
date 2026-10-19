// The Apply script: one ssh per Machine, running every planned Step with
// markers. The output between ff-step and ff-done belongs to that step;
// fleetfizz shows it only when the step fails.
import { CONFIG_FILE, SCHEMA_FILE } from "@fleetfizz/config";
import type { MachinePlan, ProviderPlan, Step } from "@fleetfizz/core";

import { CONFIG_DIR_SH } from "./check.ts";
import { doneLine, skipLine, stepLine } from "./protocol.ts";
import { fingerprintFn, prelude, quote } from "./shell.ts";

// The config copy, one step on every Machine (ADR 0008).
export const CONFIG_STEP = "config";
// Marks the end of the script, so a script that stopped between steps is detected.
export const END_STEP = "end";

// Step `id`: its start marker, `run`, then exactly one done marker with the
// exit code of `run`'s last command. `failed` runs only after a failure.
const marked = (
  id: string,
  run: ReadonlyArray<string>,
  failed: ReadonlyArray<string> = [],
): string[] => [
  stepLine(id),
  ...run,
  `ff_code=$?`,
  `if [ "$ff_code" -ne 0 ]; then`,
  doneLine(id, false, "$ff_code"),
  ...failed,
  "else",
  doneLine(id, true),
  "fi",
];

// Writes the Starting Machine's config and the schema beside it, from stdin
// lines 2 and 3, atomically. One && chain, so the step fails on the first
// failed write (set -e would not stop at the left side of an && list).
const configStep = (): string[] => {
  const dir = CONFIG_DIR_SH;
  const write = (variable: string, file: string) =>
    `printf '%s' "$${variable}" | base64 -d > ${dir}/${quote(`${file}.tmp`)} && mv -f ${dir}/${quote(`${file}.tmp`)} ${dir}/${quote(file)}`;
  return marked(CONFIG_STEP, [
    `( mkdir -p ${dir} && ${write("ff_config", CONFIG_FILE)} && ${write("ff_schema", SCHEMA_FILE)} )`,
  ]);
};

// One Provider's Steps. A Provider whose dependency failed at runtime skips
// every Step ("depends on <dependency>") and is held itself, even with no
// Steps, so a hold passes down a chain as it does in planMachine. Within a
// Provider, a Step sharing an Item with a failed Step is skipped. Any failure
// holds back the Provider's dependents. Flags are shell variables:
// ff_held_<provider>, and ff_f_<provider>_<n> per Item. A Step's inputs are
// copied from the stdin lines read at the top (`offsets`) into its own
// $ff_input_<i>.
const providerSteps = (plan: ProviderPlan, offsets: ReadonlyMap<Step, number>): string[] => {
  // Nothing targeted: like planMachine, not a link in any chain.
  if (plan.decisions.length === 0 && plan.steps.length === 0) return [];
  const held = `ff_held_${plan.name}`;
  const items = [...new Set(plan.steps.flatMap((step) => step.items))];
  const flag = (item: string) => `ff_f_${plan.name}_${items.indexOf(item)}`;
  const step = (s: Step): string[] => [
    `if [ -n "${s.items.map((item) => `\${${flag(item)}:-}`).join("")}" ]; then`,
    skipLine(s.id, "'an earlier step failed'"),
    "else",
    ...(s.input ?? []).map((_, i) => `ff_input_${i}="$ff_in_${(offsets.get(s) ?? 0) + i}"`),
    ...marked(s.id, s.run, [...s.items.map((item) => `${flag(item)}=1`), `${held}=1`]),
    "fi",
  ];
  const why = [
    `ff_why=""`,
    ...plan.dependsOn.map(
      (dep) =>
        `if [ -z "$ff_why" ] && [ -n "\${ff_held_${dep}:-}" ]; then ff_why=${quote(dep)}; fi`,
    ),
  ];
  if (plan.steps.length === 0) return [...why, `if [ -n "$ff_why" ]; then ${held}=1; fi`];
  return [
    ...why,
    `if [ -n "$ff_why" ]; then`,
    `${held}=1`,
    ...plan.steps.map((s) => skipLine(s.id, `"depends on $ff_why"`)),
    "else",
    ...plan.steps.flatMap(step),
    "fi",
  ];
};

// Every Step input in the plan, in the order the apply script reads them.
const inputsOf = (plan: MachinePlan) =>
  plan.providers.flatMap((p) => p.steps.flatMap((step) => step.input ?? []));

// Where each Step's inputs start among them.
const inputOffsets = (plan: MachinePlan): ReadonlyMap<Step, number> => {
  const offsets = new Map<Step, number>();
  let next = 0;
  for (const step of plan.providers.flatMap((p) => p.steps)) {
    offsets.set(step, next);
    next += step.input?.length ?? 0;
  }
  return offsets;
};

// The stdin lines the apply script reads, in order: the Lent Token, the
// config text, the schema text (the last two base64, so each is one line),
// then every Step's inputs. Each input must already be one line.
export const applyStdin = (
  token: string | undefined,
  config: string,
  schema: string,
  plan: MachinePlan,
): string[] => [
  token ?? "",
  encodeBase64(config),
  encodeBase64(schema),
  ...inputsOf(plan).map((input) => input.reveal()),
];

const encodeBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

// Shell every Step may use besides the prelude: ff_lit prints $1 verbatim (a
// JSON literal the Starting Machine prepared); ff_git is git with the Lent
// Token, which only it sees.
export const applyScript = (plan: MachinePlan): string => {
  const offsets = inputOffsets(plan);
  return [
    prelude,
    fingerprintFn,
    `ff_lit() { printf '%s' "$1"; }`,
    // stdin: line 1 the Lent Token (empty when none), line 2 the config and
    // line 3 the schema, both base64 (ADR 0008), then the Steps' inputs.
    `IFS= read -r ff_token || ff_token=""`,
    `IFS= read -r ff_config || ff_config=""`,
    `IFS= read -r ff_schema || ff_schema=""`,
    // Every input line ends in a newline, so a failed read is a cut-off
    // stdin: stop before any Step rather than write empty contents.
    ...inputsOf(plan).map((_, i) => `IFS= read -r ff_in_${i} || exit 1`),
    `ff_git() { if [ -n "$ff_token" ]; then FF_TOKEN="$ff_token" git -c credential.helper= -c 'credential.helper=!f() { echo username=x-access-token; echo "password=$FF_TOKEN"; }; f' "$@"; else git "$@"; fi; }`,
    // The config first, then each Provider in run order.
    ...configStep(),
    ...plan.providers.flatMap((p) => providerSteps(p, offsets)),
    doneLine(END_STEP, true),
  ].join("\n");
};
