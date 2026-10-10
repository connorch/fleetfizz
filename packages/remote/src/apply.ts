// The Apply script: one ssh per Machine, running every planned Step with
// markers. The output between ff-step and ff-done belongs to that step;
// fleetfizz shows it only when the step fails.
import * as Schema from "effect/Schema";

import type { MachinePlan, RepoStep, VpStep } from "@fleetfizz/core";

import { RECORDS_DIR } from "./gather.ts";
import { doneLine, stepLine } from "./protocol.ts";
import { fingerprintFn, prelude, quote, quotePath } from "./shell.ts";

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
export const vpStepId = (step: VpStep): string =>
  step.kind === "reinstall"
    ? `vp:reinstall:${step.name}`
    : step.kind === "globals"
      ? "vp:globals"
      : `vp:${step.kind}`;

// One vp step: the command in a subshell, then its marker.
const vpStep = (step: VpStep): string[] => {
  const id = vpStepId(step);
  const command = (() => {
    switch (step.kind) {
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
  return [
    stepLine(id),
    `( ${command} )`,
    `ff_code=$?`,
    `if [ "$ff_code" -ne 0 ]; then ${doneLine(id, false, "$ff_code")}; else ${doneLine(id, true)}; fi`,
  ];
};
// Marks the end of the script, so a script that stopped between steps is detected.
export const END_STEP = "end";

// Writes the record for `repo` from inside the Managed Clone ($ff_d) after a
// successful install. Fingerprints are taken now, so the next Gather compares
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
    stepLine(fetch),
    "(",
    "  set -e",
    `  if [ ! -d "$ff_d/.git" ]; then ff_git clone --quiet ${quote(url)} "$ff_d"; fi`,
    `  if [ "$(git -C "$ff_d" remote get-url origin)" != ${quote(url)} ]; then echo "origin is $(git -C "$ff_d" remote get-url origin), expected ${url}"; exit 1; fi`,
    ...sync.map((l) => `  ${l}`),
    `  git -C "$ff_d" clean --quiet -fd`,
    ...writeFiles(repo).map((l) => `  ${l}`),
    ")",
    `ff_code=$?`,
    `if [ "$ff_code" -ne 0 ]; then ${doneLine(fetch, false, "$ff_code")}; else`,
    `${doneLine(fetch, true)}`,
    `ff_after=$(git -C "$ff_d" rev-parse HEAD)`,
    // The planner decided from the pre-fetch HEAD; a fetch that moved HEAD reinstalls too.
    `if [ ${repo.decision.run ? "true" : "false"} = true ] || [ "$ff_after" != "$ff_before" ]; then`,
    `  ${stepLine(install)}`,
    `  (cd "$ff_d" && ${envPrefix} "\${SHELL:-/bin/sh}" -lc ${quote(repo.install)})`,
    `  ff_code=$?`,
    `  if [ "$ff_code" -ne 0 ]; then ${doneLine(install, false, "$ff_code")}; else`,
    // The install counts only once its record is on disk.
    "    (",
    "      set -e",
    ...writeRecord(repo).map((l) => `      ${l}`),
    "    )",
    `    ff_code=$?`,
    `    if [ "$ff_code" -ne 0 ]; then echo "could not write the install record"; ${doneLine(install, false, "$ff_code")}; else ${doneLine(install, true)}; fi`,
    "  fi",
    "fi",
    "fi",
  ];
};

export const applyScript = (input: ApplyInput): string => {
  const lines = [
    prelude,
    fingerprintFn,
    // Prints $1 verbatim (a JSON literal the Starting Machine prepared).
    `ff_lit() { printf '%s' "$1"; }`,
    // Line 1 of stdin: the Lent Token, empty when none. Only ff_git sees it.
    `IFS= read -r ff_token || ff_token=""`,
    `ff_git() { if [ -n "$ff_token" ]; then FF_TOKEN="$ff_token" git -c credential.helper= -c 'credential.helper=!f() { echo username=x-access-token; echo "password=$FF_TOKEN"; }; f' "$@"; else git "$@"; fi; }`,
    `ff_root=${quotePath(input.cloneRoot)}`,
    ...(input.cloneRoot.startsWith("~") ? [`mkdir -p "$ff_root"`] : []),
  ];
  // The vp section first: Install Commands need pnpm and Node.
  for (const step of input.plan.vp) lines.push(...vpStep(step));
  for (const repo of input.plan.repos) lines.push(...repoSteps(repo, input));
  lines.push(doneLine(END_STEP, true));
  return lines.join("\n");
};
