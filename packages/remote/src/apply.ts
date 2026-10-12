// The Apply script: one ssh per Machine, running every planned Step with
// markers. The output between ff-step and ff-done belongs to that step;
// fleetfizz shows it only when the step fails.
import * as Schema from "effect/Schema";

import { CONFIG_FILE, SCHEMA_FILE } from "@fleetfizz/config";
import type { MachinePlan, RepoStep, VpStep } from "@fleetfizz/core";

import { CONFIG_DIR_SH, RECORDS_DIR } from "./check.ts";
import { doneLine, stepLine } from "./protocol.ts";
import { fingerprintFn, prelude, quote, quotePath, vpEnv } from "./shell.ts";

// JSON literals for the record template; everything but the commit and the
// Output fingerprints, which only the Machine knows after the install.
const jsonString = Schema.encodeSync(Schema.fromJsonString(Schema.String));
const jsonRecord = Schema.encodeSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)),
);

export interface ApplyInput {
  readonly plan: MachinePlan;
  readonly cloneRoot: string;
  // Environment for every Install Command (brief section 13).
  readonly env: {
    readonly machine: string;
    readonly platform: string;
    readonly machines: ReadonlyArray<string>;
  };
}

export const stepId = (repo: string, step: "fetch" | "install") => `repo:${repo}:${step}`;
// A Tracked Repo's fetch: the first half of its install, which every Ship runs.
export const isFetchStep = (id: string): boolean => id.startsWith("repo:") && id.endsWith(":fetch");
export const vpStepId = (step: VpStep): string =>
  step.kind === "reinstall"
    ? `vp:reinstall:${step.name}`
    : step.kind === "globals"
      ? "vp:globals"
      : `vp:${step.kind}`;
// The config copy, one step on every Machine (ADR 0008).
export const CONFIG_STEP = "config";

// vp's installer, then its env file again so `vp` resolves for the rest of
// the script.
const VP_INSTALL = [
  "curl -fsSL https://vite.plus | bash",
  ...vpEnv.split("\n"),
  // Braced so its `|| true` cannot swallow a failed installer earlier in the chain.
  "{ hash -r 2>/dev/null || true; }",
].join(" && ");

// Step `id`: its start marker, `run`, then exactly one done marker with the
// exit code of `run`'s last command. `then` runs only after a success.
const marked = (
  id: string,
  run: ReadonlyArray<string>,
  then: ReadonlyArray<string> = [],
): string[] => [
  stepLine(id),
  ...run,
  `ff_code=$?`,
  `if [ "$ff_code" -ne 0 ]; then ${doneLine(id, false, "$ff_code")}; else`,
  doneLine(id, true),
  ...then,
  "fi",
];

// One vp step: the command in a subshell.
const vpStep = (step: VpStep): string[] => {
  const id = vpStepId(step);
  const command = (() => {
    switch (step.kind) {
      case "bootstrap":
        return VP_INSTALL;
      case "vp":
        return `command vp upgrade ${quote(step.version)}`;
      case "node":
        return `command vp env default ${quote(step.version)}`;
      case "reinstall":
        return `command vp install -g ${quote(`${step.name}@${step.version}`)}`;
      case "globals":
        return `command vp install -g ${step.packages.map((p) => quote(`${p.name}@${p.version}`)).join(" ")}`;
    }
  })();
  // The bootstrap runs in this shell so its PATH change reaches later steps.
  return marked(id, [step.kind === "bootstrap" ? command : `( ${command} )`]);
};

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
// Marks the end of the script, so a script that stopped between steps is detected.
export const END_STEP = "end";

// Writes the record for `repo` from inside the Managed Clone ($ff_d) after a
// successful install. Fingerprints are taken now, so the next Check compares
// against what this install produced.
const writeRecord = (repo: RepoStep): string[] => {
  const lines = [
    `ff_outs=""`,
    ...repo.outputs.map(
      (o) =>
        `ff_fpv=$(ff_fp ${quotePath(o)}); if [ -n "$ff_fpv" ]; then ff_outs="$ff_outs,\\"$(ff_json ${quote(o)})\\":\\"$(ff_json "$ff_fpv")\\""; fi`,
    ),
    `mkdir -p ${quotePath(RECORDS_DIR)}`,
    `printf '%s\\n' "{\\"commit\\":\\"$ff_after\\",\\"path\\":\\"$(ff_json "$ff_d")\\",\\"install\\":$(ff_lit ${quote(jsonString(repo.install))}),\\"files\\":$(ff_lit ${quote(jsonRecord(repo.files))}),\\"outputs\\":{\${ff_outs#,}}}" > ${quotePath(RECORDS_DIR)}/${quote(`${repo.name}.json.tmp`)}`,
    `mv -f ${quotePath(RECORDS_DIR)}/${quote(`${repo.name}.json.tmp`)} ${quotePath(RECORDS_DIR)}/${quote(`${repo.name}.json`)}`,
  ];
  return lines;
};

// Writes the repo's Files into the Managed Clone before the install.
const writeFiles = (repo: RepoStep): string[] =>
  Object.entries(repo.files).flatMap(([path, content]) => [
    `mkdir -p "$(dirname "$ff_d"/${quote(path)})"`,
    `printf '%s' ${quote(content)} > "$ff_d"/${quote(path)}`,
  ]);

const repoSteps = (repo: RepoStep, input: ApplyInput): string[] => {
  const fetch = stepId(repo.name, "fetch");
  const install = stepId(repo.name, "install");
  const url = `https://github.com/${repo.origin}.git`;
  const sync = repo.pin
    ? [
        `if [ "$(git -C "$ff_d" rev-parse HEAD)" != ${quote(repo.ref)} ]; then ff_git -C "$ff_d" fetch --quiet origin ${quote(repo.ref)}; fi`,
        `git -C "$ff_d" checkout --quiet --detach ${quote(repo.ref)}`,
        `git -C "$ff_d" reset --quiet --hard ${quote(repo.ref)}`,
      ]
    : [
        `ff_git -C "$ff_d" fetch --quiet origin ${quote(repo.ref)}`,
        `git -C "$ff_d" reset --quiet --hard ${quote(`origin/${repo.ref}`)}`,
      ];
  const envPrefix = `FLEETFIZZ_MACHINE=${quote(input.env.machine)} FLEETFIZZ_PLATFORM=${quote(input.env.platform)} FLEETFIZZ_MACHINES=${quote(input.env.machines.join(","))}`;
  return [
    `ff_d="$ff_root"/${quote(repo.name)}`,
    `ff_before=$(git -C "$ff_d" rev-parse HEAD 2>/dev/null || true)`,
    ...marked(
      fetch,
      [
        "(",
        "  set -e",
        `  if [ ! -d "$ff_d/.git" ]; then ff_git clone --quiet ${quote(url)} "$ff_d"; fi`,
        `  if [ "$(git -C "$ff_d" remote get-url origin)" != ${quote(url)} ]; then echo "origin is $(git -C "$ff_d" remote get-url origin), expected ${url}"; exit 1; fi`,
        ...sync.map((l) => `  ${l}`),
        `  git -C "$ff_d" clean --quiet -fd`,
        ...writeFiles(repo).map((l) => `  ${l}`),
        ")",
      ],
      [
        `ff_after=$(git -C "$ff_d" rev-parse HEAD)`,
        // The commit the fetch reached, so the Ledger can show `before -> after`.
        `ff_state "{\\"fact\\":\\"repo\\",\\"name\\":\\"$(ff_json ${quote(repo.name)})\\",\\"present\\":true,\\"head\\":\\"$(ff_json "$ff_after")\\"}"`,
        // The planner decided from the pre-fetch HEAD; a fetch that moved HEAD reinstalls too.
        `if [ ${repo.decision.run ? "true" : "false"} = true ] || [ "$ff_after" != "$ff_before" ]; then`,
        // Not `marked`: the install counts only once its record is on disk,
        // and the record's `set -e` subshell must stand alone (on the left
        // of `||` the shell would ignore its `set -e`).
        `  ${stepLine(install)}`,
        `  (cd "$ff_d" && ${envPrefix} "\${SHELL:-/bin/sh}" -lc ${quote(repo.install)})`,
        `  ff_code=$?`,
        `  if [ "$ff_code" -ne 0 ]; then ${doneLine(install, false, "$ff_code")}; else`,
        "    (",
        "      set -e",
        ...writeRecord(repo).map((l) => `      ${l}`),
        "    )",
        `    ff_code=$?`,
        `    if [ "$ff_code" -ne 0 ]; then echo "could not write the install record"; ${doneLine(install, false, "$ff_code")}; else ${doneLine(install, true)}; fi`,
        "  fi",
        "fi",
      ],
    ),
  ];
};

// The stdin lines the apply script reads, in order: the Lent Token, the
// config text, and the schema text (the last two base64, so each is one line).
export const applyStdin = (token: string | undefined, config: string, schema: string): string[] => [
  token ?? "",
  encodeBase64(config),
  encodeBase64(schema),
];

const encodeBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const applyScript = (input: ApplyInput): string => {
  const lines = [
    prelude,
    fingerprintFn,
    // Prints $1 verbatim (a JSON literal the Starting Machine prepared).
    `ff_lit() { printf '%s' "$1"; }`,
    // stdin: line 1 the Lent Token (empty when none; only ff_git sees it),
    // line 2 the config and line 3 the schema, both base64 (ADR 0008).
    `IFS= read -r ff_token || ff_token=""`,
    `IFS= read -r ff_config || ff_config=""`,
    `IFS= read -r ff_schema || ff_schema=""`,
    `ff_git() { if [ -n "$ff_token" ]; then FF_TOKEN="$ff_token" git -c credential.helper= -c 'credential.helper=!f() { echo username=x-access-token; echo "password=$FF_TOKEN"; }; f' "$@"; else git "$@"; fi; }`,
    `ff_root=${quotePath(input.cloneRoot)}`,
    ...(input.cloneRoot.startsWith("~") ? [`mkdir -p "$ff_root"`] : []),
  ];
  // The config first, then the vp section: Install Commands need pnpm and Node.
  lines.push(...configStep());
  for (const step of input.plan.vp) lines.push(...vpStep(step));
  for (const repo of input.plan.repos) lines.push(...repoSteps(repo, input));
  lines.push(doneLine(END_STEP, true));
  return lines.join("\n");
};
