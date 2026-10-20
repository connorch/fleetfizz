// The read-only Check script: one ssh per Machine, printing ff-state Facts.
// The engine's Facts (home, records, config, end) around each Provider's own.
import { CONFIG_FILE } from "@fleetfizz/config";
import { shellInitFor, type AnyProvider, type Named, type Scope } from "@fleetfizz/core";

import { fingerprintFn, preludeFor, quote, quotePath } from "./shell.ts";

export interface CheckInput {
  readonly scope: Scope;
  // In run order, each with its Items that target this Machine.
  readonly providers: ReadonlyArray<{
    readonly provider: AnyProvider;
    readonly items: ReadonlyArray<Named>;
  }>;
}

export const STATE_DIR = "~/.local/state/fleetfizz";
export const RECORDS_DIR = `${STATE_DIR}/records`;
// Ship Logs, on the Machine that started each Ship (ADR 0015).
export const LOGS_DIR = `${STATE_DIR}/logs`;
// The config directory on a Machine, as a shell expression (ADR 0008).
export const CONFIG_DIR_SH = '"${XDG_CONFIG_HOME:-$HOME/.config}/fleetfizz"';

// Where an Item's Install Record lives on a Machine, as a shell word.
export const recordDir = (provider: string): string =>
  `${quotePath(RECORDS_DIR)}/${quote(provider)}`;
export const recordFile = (provider: string, item: string): string =>
  `${recordDir(provider)}/${quote(`${item}.json`)}`;
// The Config's own Install Record (ADR 0008), beside the Providers' records.
export const CONFIG_RECORD = `${RECORDS_DIR}/config.json`;
// Records written before Providers sat directly in RECORDS_DIR, one per repo.
// Read when the Item has no record of its own yet; the next install moves it.
const LEGACY_RECORD_PROVIDER = "repos";

const recordFact = (provider: string, item: string): string[] => [
  `ff_r=${recordFile(provider, item)}`,
  ...(provider === LEGACY_RECORD_PROVIDER
    ? [`[ -f "$ff_r" ] || ff_r=${quotePath(RECORDS_DIR)}/${quote(`${item}.json`)}`]
    : []),
  `if [ -f "$ff_r" ]; then ff_state "{\\"fact\\":\\"record\\",\\"provider\\":\\"${provider}\\",\\"item\\":\\"$(ff_json ${quote(item)})\\",\\"record\\":$(tr -d '\\n' < "$ff_r")}"; fi`,
];

export const checkScript = (input: CheckInput): string => {
  const lines = [
    // A Check changes nothing: a mise shim for a tool that is not installed
    // fails instead of installing it.
    "export MISE_NOT_FOUND_AUTO_INSTALL=false",
    preludeFor(shellInitFor(input.scope.config, input.scope.machine)),
    fingerprintFn,
    `ff_state "{\\"fact\\":\\"home\\",\\"path\\":\\"$(ff_json "$HOME")\\"}"`,
  ];
  for (const { provider, items } of input.providers) {
    lines.push(provider.observe(items, input.scope));
    if (provider.rule === "record")
      for (const item of items) lines.push(...recordFact(provider.name, item.name));
  }
  // The Machine's config, base64 on one line (`base64 -w0` is linux only),
  // with the sha256 of those same bytes (the file is read once), and the
  // config's own record.
  lines.push(
    `ff_c=${CONFIG_DIR_SH}/${quote(CONFIG_FILE)}`,
    `if [ -f "$ff_c" ]; then ff_b=$(base64 < "$ff_c" | tr -d '\\n'); ff_state "{\\"fact\\":\\"config\\",\\"present\\":true,\\"sha\\":\\"$(printf '%s' "$ff_b" | base64 -d | ff_sha)\\",\\"base64\\":\\"$ff_b\\"}"; else ff_state '{"fact":"config","present":false}'; fi`,
    `ff_r=${quotePath(CONFIG_RECORD)}`,
    `if [ -f "$ff_r" ]; then ff_state "{\\"fact\\":\\"configRecord\\",\\"record\\":$(tr -d '\\n' < "$ff_r")}"; fi`,
  );
  lines.push(`ff_state '{"fact":"end"}'`);
  return lines.join("\n");
};
