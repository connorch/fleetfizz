// The read-only Gather script: one ssh per Machine, printing ff-state Facts.
import { prelude, quote, quotePath } from "./shell.ts";

export interface GatherRepo {
  readonly name: string;
  readonly outputs: ReadonlyArray<string>;
}

export interface GatherInput {
  readonly cloneRoot: string;
  readonly repos: ReadonlyArray<GatherRepo>;
}

export const STATE_DIR = "~/.local/state/fleetfizz";
export const RECORDS_FILE = `${STATE_DIR}/install-records.json`;

// Fingerprints one path: a symlink by its target, a file by its sha256, a
// directory by the sha256 of its sorted file list and file hashes (never
// mtimes). Prints nothing when the path is missing.
const fingerprintFn = [
  "ff_fp() {",
  '  if [ -L "$1" ]; then printf \'link:%s\' "$(readlink "$1")";',
  '  elif [ -f "$1" ]; then printf \'file:%s\' "$(shasum -a 256 < "$1" | cut -d" " -f1)";',
  '  elif [ -d "$1" ]; then printf \'tree:%s\' "$( (cd "$1" && find . -type f -print0 | sort -z | xargs -0 shasum -a 256) | shasum -a 256 | cut -d" " -f1)";',
  "  fi",
  "}",
].join("\n");

export const gatherScript = (input: GatherInput): string => {
  const lines = [
    prelude,
    fingerprintFn,
    `ff_state "{\\"fact\\":\\"home\\",\\"path\\":\\"$(ff_json "$HOME")\\"}"`,
    // vp: version and where it is (a Homebrew path means `vp upgrade` cannot upgrade it).
    "if command -v vp >/dev/null 2>&1; then",
    `  ff_v=$(command vp --version 2>/dev/null | sed -n 's/^vp v\\{0,1\\}\\([^ ]*\\).*/\\1/p' | head -n 1)`,
    `  ff_state "{\\"fact\\":\\"vp\\",\\"version\\":\\"$(ff_json "$ff_v")\\",\\"path\\":\\"$(ff_json "$(command -v vp)")\\"}"`,
    `  ff_n=$(command vp env default 2>/dev/null | sed -n 's/^Default Node.js version: //p' | head -n 1)`,
    `  if [ -n "$ff_n" ]; then ff_state "{\\"fact\\":\\"node\\",\\"version\\":\\"$(ff_json "$ff_n")\\"}"; else ff_state '{"fact":"node","version":null}'; fi`,
    `  ff_g=$(command vp list --global --json 2>/dev/null | tr -d '\\n')`,
    `  ff_state "{\\"fact\\":\\"globals\\",\\"list\\":\${ff_g:-[]}}"`,
    "else",
    `  ff_state '{"fact":"vp","version":null}'`,
    "fi",
    `ff_root=${quotePath(input.cloneRoot)}`,
    `if [ -d "$ff_root" ]; then ff_present=true; else ff_present=false; fi`,
    `ff_state "{\\"fact\\":\\"cloneRoot\\",\\"path\\":\\"$(ff_json "$ff_root")\\",\\"present\\":$ff_present}"`,
  ];
  for (const repo of input.repos) {
    const name = quote(repo.name);
    lines.push(
      `ff_d="$ff_root"/${name}`,
      `if [ -d "$ff_d/.git" ]; then`,
      `  ff_state "{\\"fact\\":\\"repo\\",\\"name\\":\\"$(ff_json ${name})\\",\\"present\\":true,\\"head\\":\\"$(ff_json "$(git -C "$ff_d" rev-parse HEAD 2>/dev/null)")\\",\\"origin\\":\\"$(ff_json "$(git -C "$ff_d" remote get-url origin 2>/dev/null)")\\"}"`,
      "else",
      `  ff_state "{\\"fact\\":\\"repo\\",\\"name\\":\\"$(ff_json ${name})\\",\\"present\\":false}"`,
      "fi",
    );
    for (const output of repo.outputs) {
      lines.push(
        `ff_p=${quotePath(output)}; ff_f=$(ff_fp "$ff_p")`,
        `if [ -n "$ff_f" ]; then ff_state "{\\"fact\\":\\"output\\",\\"repo\\":\\"$(ff_json ${name})\\",\\"path\\":\\"$(ff_json ${quote(output)})\\",\\"fingerprint\\":\\"$(ff_json "$ff_f")\\"}"; else ff_state "{\\"fact\\":\\"output\\",\\"repo\\":\\"$(ff_json ${name})\\",\\"path\\":\\"$(ff_json ${quote(output)})\\",\\"fingerprint\\":null}"; fi`,
      );
    }
  }
  lines.push(
    `ff_r=${quotePath(RECORDS_FILE)}`,
    `if [ -f "$ff_r" ]; then ff_state "{\\"fact\\":\\"records\\",\\"records\\":$(tr -d '\\n' < "$ff_r")}"; fi`,
  );
  return lines.join("\n");
};
