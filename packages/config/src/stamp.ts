// The Ship stamp: `shippedAt` and `shippedFrom`, written into the config by
// every real Ship before it is copied to the Fleet (ADR 0008). Only those two
// values change; comments and formatting stay, as with "bump".
import * as jsonc from "jsonc-parser";

export interface Stamp {
  readonly shippedAt: string;
  readonly shippedFrom: string;
}

// Keeps the stamp near the top: after $schema, or first.
const insertAfter = (before: ReadonlyArray<string>) => (properties: string[]) => {
  const index = before.map((key) => properties.indexOf(key)).reduce((a, b) => Math.max(a, b), -1);
  return index + 1;
};

export const stampText = (text: string, stamp: Stamp): string => {
  const options = { formattingOptions: { insertSpaces: true, tabSize: 2 } };
  let out = jsonc.applyEdits(
    text,
    jsonc.modify(text, ["shippedAt"], stamp.shippedAt, {
      ...options,
      getInsertionIndex: insertAfter(["$schema"]),
    }),
  );
  out = jsonc.applyEdits(
    out,
    jsonc.modify(out, ["shippedFrom"], stamp.shippedFrom, {
      ...options,
      getInsertionIndex: insertAfter(["$schema", "shippedAt"]),
    }),
  );
  return out;
};

// Whether `remote` was shipped after `local`. A copy without a stamp is older
// than any stamped copy, and two unstamped copies are not newer than each other.
export const isNewer = (remote: string | undefined, local: string | undefined): boolean =>
  remote !== undefined && (local === undefined || remote > local);
