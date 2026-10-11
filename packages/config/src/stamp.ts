// The Ship stamp: `shippedAt`, `shippedFrom`, and `shippedTo`, written into
// the config by every real Ship before it is copied to the Fleet (ADR 0008).
// Only those values change; comments and formatting stay, as with "bump".
import * as jsonc from "jsonc-parser";

export interface Stamp {
  readonly shippedAt: string;
  readonly shippedFrom: string;
  // The Machines this Ship reaches. Each gets `shippedAt` in `shippedTo`;
  // entries for other Machines are kept as they were.
  readonly reached: ReadonlyArray<string>;
}

// Keeps the stamp near the top: after $schema, or first.
const insertAfter = (before: ReadonlyArray<string>) => (properties: string[]) => {
  const index = before.map((key) => properties.indexOf(key)).reduce((a, b) => Math.max(a, b), -1);
  return index + 1;
};

const STAMP_KEYS = ["$schema", "shippedAt", "shippedFrom", "shippedTo"];

export const stampText = (text: string, stamp: Stamp): string => {
  const options = { formattingOptions: { insertSpaces: true, tabSize: 2 } };
  const set = (current: string, key: string, value: unknown) =>
    jsonc.applyEdits(
      current,
      jsonc.modify(current, [key], value, {
        ...options,
        getInsertionIndex: insertAfter(STAMP_KEYS.slice(0, STAMP_KEYS.indexOf(key))),
      }),
    );
  const previous: unknown = jsonc.parse(text, undefined, { allowTrailingComma: true });
  const existing = shippedToOf(previous);
  const shippedTo = {
    ...existing,
    ...Object.fromEntries(stamp.reached.map((name) => [name, stamp.shippedAt])),
  };
  let out = set(text, "shippedAt", stamp.shippedAt);
  out = set(out, "shippedFrom", stamp.shippedFrom);
  return set(out, "shippedTo", shippedTo);
};

const shippedToOf = (config: unknown): Record<string, string> => {
  if (typeof config !== "object" || config === null || !("shippedTo" in config)) return {};
  const value = config.shippedTo;
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
};

// Whether `remote` was shipped after `local`. A copy without a stamp is older
// than any stamped copy, and two unstamped copies are not newer than each other.
export const isNewer = (remote: string | undefined, local: string | undefined): boolean =>
  remote !== undefined && (local === undefined || remote > local);
