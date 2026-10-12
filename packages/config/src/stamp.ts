// The Ship stamp: `shippedAt`, `shippedFrom`, and `shippedTo`, written into
// the config by every real Ship before it is copied to the Fleet (ADR 0008).
// Only those values change; comments and formatting stay, as with "bump".
import * as jsonc from "jsonc-parser";

import type { FleetConfig } from "./schema.ts";

export interface Stamp {
  readonly shippedAt: string;
  readonly shippedFrom: string;
  // The Machines this Ship reaches. Each gets `shippedAt` in `shippedTo`;
  // entries for other Fleet Machines are kept as they were, and entries for
  // Machines no longer in `machines` are dropped.
  readonly reached: ReadonlyArray<string>;
  // The Machine whose copy is being stamped, when it is one (see `staleCopies`):
  // it is reached too, even when --only left it out of the Ship.
  readonly own?: string | undefined;
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
  const fleet = machinesOf(previous);
  const existing = Object.fromEntries(
    Object.entries(shippedToOf(previous)).filter(([name]) => fleet.includes(name)),
  );
  const shippedTo = {
    ...existing,
    ...Object.fromEntries(
      [...stamp.reached, ...(stamp.own === undefined ? [] : [stamp.own])].map((name) => [
        name,
        stamp.shippedAt,
      ]),
    ),
  };
  let out = set(text, "shippedAt", stamp.shippedAt);
  out = set(out, "shippedFrom", stamp.shippedFrom);
  return set(out, "shippedTo", shippedTo);
};

const machinesOf = (config: unknown): ReadonlyArray<string> => {
  if (typeof config !== "object" || config === null || !("machines" in config)) return [];
  const value = config.machines;
  return typeof value === "object" && value !== null ? Object.keys(value) : [];
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

// One Machine's copy of the config, as its Check read it.
export interface Copy {
  readonly machine: string;
  readonly config: Pick<FleetConfig, "shippedAt" | "shippedFrom" | "shippedTo">;
}

// The copies a Ship of `config` would roll back (Stale Configs, ADR 0008): a
// Machine whose copy says it received a config more recently than `config`
// last reached it, so a Ship from elsewhere missed it. The comparison is per
// Machine, so a Ship that missed a Machine cannot outdate it. `own` is the
// Machine whose copy `config` is: the Starting Machine, unless --config named
// another file, which leaves that Machine's copy to be checked like any other.
export const staleCopies = (
  config: Copy["config"],
  copies: ReadonlyArray<Copy>,
  own: string | undefined,
): ReadonlyArray<Copy> =>
  copies.filter(
    (c) =>
      c.machine !== own && isNewer(c.config.shippedTo?.[c.machine], config.shippedTo?.[c.machine]),
  );
