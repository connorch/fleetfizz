// The Config's Install Record (ADR 0008), on every Machine beside the other
// Install Records: the Ship that last wrote the Config there, the sha256 of
// what it wrote, and `reached`, when a Ship of this Config last reached each
// Machine. `reached` travels with every copy a Ship writes, so the next Ship
// from any Machine can tell a Config it would roll back from one it already
// overwrote.
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const Reached = Schema.Record(Schema.NonEmptyString, Schema.String);
export type Reached = typeof Reached.Type;

export const ConfigRecord = Schema.Struct({
  ship: Schema.NonEmptyString,
  sha: Schema.String,
  reached: Reached,
});
export type ConfigRecord = typeof ConfigRecord.Type;

export const decodeConfigRecord = Schema.decodeUnknownOption(ConfigRecord);
export const decodeConfigRecordJson = Schema.decodeUnknownOption(
  Schema.fromJsonString(ConfigRecord),
);
export const encodeConfigRecord = Schema.encodeSync(Schema.fromJsonString(ConfigRecord));

// The sha256 of `text` as a Ship writes it, in hex.
export const shaOf = (text: string): Effect.Effect<string> =>
  Effect.promise(() =>
    globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  ).pipe(
    Effect.map((digest) =>
      [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""),
    ),
  );

// `previous` after a Ship at `at` reached `machines`: theirs become `at`, the
// others stay, and Machines no longer in `fleet` are dropped.
export const reachedAfter = (
  previous: Reached,
  at: string,
  machines: ReadonlyArray<string>,
  fleet: ReadonlyArray<string>,
): Reached => ({
  ...Object.fromEntries(Object.entries(previous).filter(([name]) => fleet.includes(name))),
  ...Object.fromEntries(machines.map((name) => [name, at])),
});

// Several copies' `reached`, each Machine at its newest: copies with the same
// text are one Config, whatever Ships wrote them.
export const mergeReached = (all: ReadonlyArray<Reached>): Reached => {
  const merged: Record<string, string> = {};
  for (const reached of all)
    for (const [name, at] of Object.entries(reached))
      if (isNewer(at, merged[name])) merged[name] = at;
  return merged;
};

// Whether `remote` is after `local`. A missing time is older than any other,
// and two missing times are not newer than each other.
export const isNewer = (remote: string | undefined, local: string | undefined): boolean =>
  remote !== undefined && (local === undefined || remote > local);

// One Machine's copy of the Config, as its Check read it, when it differs
// from the Config being shipped.
export interface ConfigCopy {
  readonly machine: string;
  readonly sha: string;
  readonly record?: ConfigRecord | undefined;
}

// Why a Ship of a Config whose `reached` is `base` must ask before
// overwriting `copy` (a Stale Config), or undefined when it may: no Ship
// wrote the copy, it was edited there (Drift), or a Ship reached that
// Machine after this Config last did, so it missed this one.
export const staleWhy = (
  copy: ConfigCopy,
  base: Reached,
): "unrecorded" | "edited" | "newer" | undefined =>
  copy.record === undefined
    ? "unrecorded"
    : copy.record.sha !== copy.sha
      ? "edited"
      : isNewer(copy.record.reached[copy.machine], base[copy.machine])
        ? "newer"
        : undefined;
