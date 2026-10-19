// The files Provider: each Shared File, a file or directory copied from the
// Starting Machine to every targeted Machine (ADR 0016). A directory is
// mirrored. Kept matching an Install Record on each Machine: the entries of
// the last copy a Ship wrote there, so an edit made there (Drift) or a newer
// copy from another Ship asks before it is overwritten.
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Hash from "effect/Hash";
import * as Schema from "effect/Schema";

import type { SharedFile } from "@fleetfizz/config";
import {
  address,
  assembleState,
  Hidden,
  type Context,
  type Decision,
  type Provider,
  type Question,
  type Scope,
  type Step,
  type Targeting,
} from "@fleetfizz/core";
import {
  checkScript,
  parseLine,
  quote,
  quotePath,
  recordDir,
  recordFile,
  runScript,
} from "@fleetfizz/remote";

// A Shared File on one Machine, named by its key in `files.items`.
export interface FileItem extends Omit<SharedFile, keyof Targeting | "exclude"> {
  readonly name: string;
  readonly exclude: ReadonlyArray<string>;
}

// Relative path ("." for the Item's own path) -> entry: "f <mode> <sha256>",
// "d <mode>", or "l <link target>". Excluded paths are not in it.
type Entries = ReadonlyMap<string, string>;

// Never copied, deleted, or fingerprinted.
const ALWAYS_EXCLUDED = [".DS_Store", "._*"];

// An Item larger than this fails rather than stream over stdin.
export const SIZE_LIMIT = 10 * 1024 * 1024;

const FileFact = Schema.Struct({
  fact: Schema.Literal("entry"),
  item: Schema.String,
  path: Schema.String,
  entry: Schema.String,
  size: Schema.Number,
});
const decodeFact = Schema.decodeUnknownOption(FileFact);

const FileRecord = Schema.Struct({
  // When the Ship that wrote it ran, on the Starting Machine's clock.
  at: Schema.String,
  entries: Schema.Record(Schema.String, Schema.String),
});
type FileRecord = typeof FileRecord.Type;
const decodeRecord = Schema.decodeUnknownOption(FileRecord);
const jsonRecord = Schema.encodeSync(Schema.fromJsonString(FileRecord));

interface Observed {
  readonly entries: Entries;
  readonly size: number;
}

export interface FilesObserved {
  // Items missing on the Machine have no entry.
  readonly items: ReadonlyMap<string, Observed>;
  // A record that does not decode counts as none.
  readonly records: ReadonlyMap<string, FileRecord>;
}

// The Starting Machine's copy of one Item.
type Source =
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable"; readonly reason: string }
  | {
      readonly kind: "present";
      readonly entries: Entries;
      readonly record?: FileRecord;
      // Each file entry's contents, base64.
      readonly contents: ReadonlyMap<string, Hidden>;
    };

export interface FilesResolved {
  // The Starting Machine.
  readonly from: string;
  // This Ship's time, which every record it writes carries.
  readonly at: string;
  // By Item. An Item the Starting Machine has no Variant for is absent.
  readonly sources: ReadonlyMap<string, Source>;
}

export interface FileChange {
  readonly item: FileItem;
  readonly entries: Entries;
  // What the Machine has now, undefined when the Item is missing there.
  readonly current?: Entries;
  readonly contents: ReadonlyMap<string, Hidden>;
  readonly at: string;
}

// Entries as one string, so two copies are the same exactly when theirs are.
const fingerprint = (entries: Entries): string =>
  [...entries]
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([rel, entry]) => `${rel}\t${entry}\n`)
    .join("");

// A copy's short name in the Ledger and Questions ("a1b2c3d"); never compared.
const short = (entries: Entries): string =>
  (Hash.string(fingerprint(entries)) >>> 0).toString(16).padStart(8, "0").slice(0, 7);

const recordEntries = (record: FileRecord): Entries => new Map(Object.entries(record.entries));

const kindOf = (entries: Entries): string =>
  ({ f: "a file", d: "a directory", l: "a symlink" })[entries.get(".")?.[0] ?? ""] ?? "missing";

const depth = (rel: string): number => (rel === "." ? 0 : rel.split("/").length);

// The relative paths whose entries differ, for a Question: "a, b and 3 more".
const changedPaths = (a: Entries, b: Entries): string => {
  const paths = [...new Set([...a.keys(), ...b.keys()])]
    .filter((rel) => a.get(rel) !== b.get(rel))
    .toSorted();
  const shown = paths.slice(0, 3).join(", ");
  return paths.length > 3 ? `${shown} and ${paths.length - 3} more` : shown;
};

// Shell for each Item: one `entry` Fact per path under it, after excludes. A
// pattern without "/" matches a name at any depth, one with "/" a path from
// the Item's own. find never follows a symlink, so a link is one entry.
const SHELL_FNS = [
  `ff_sha() { if command -v shasum >/dev/null 2>&1; then shasum -a 256; else sha256sum; fi | cut -d" " -f1; }`,
  `ff_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }`,
  // ff_entry item rel abs
  `ff_entry() {`,
  `  if [ -L "$3" ]; then ff_e="l $(readlink "$3")"; ff_s=0`,
  // One this user cannot read is "?": its contents are unknown, never absent.
  `  elif [ -d "$3" ]; then if [ -r "$3" ] && [ -x "$3" ]; then ff_e="d $(ff_mode "$3")"; else ff_e="?"; fi; ff_s=0`,
  `  elif [ -f "$3" ]; then if [ -r "$3" ]; then ff_e="f $(ff_mode "$3") $(ff_sha < "$3")"; ff_s=$(wc -c < "$3" | tr -d " "); else ff_e="?"; ff_s=0; fi`,
  `  else return 0; fi`,
  `  ff_state "{\\"provider\\":\\"files\\",\\"fact\\":\\"entry\\",\\"item\\":\\"$(ff_json "$1")\\",\\"path\\":\\"$(ff_json "$2")\\",\\"entry\\":\\"$(ff_json "$ff_e")\\",\\"size\\":$ff_s}"`,
  `}`,
].join("\n");

const pruneExpr = (exclude: ReadonlyArray<string>): string =>
  [...ALWAYS_EXCLUDED, ...exclude]
    .map((pattern) =>
      pattern.includes("/")
        ? `-path ${quote(`./${pattern.replace(/^\/+|\/+$/g, "")}`)}`
        : `-name ${quote(pattern)}`,
    )
    .join(" -o ");

const observe = (items: ReadonlyArray<FileItem>): string => {
  if (items.length === 0) return "";
  return [
    SHELL_FNS,
    ...items.flatMap((item) => {
      const name = quote(item.name);
      return [
        `ff_p=${quotePath(item.path)}`,
        `if [ -d "$ff_p" ] && [ ! -L "$ff_p" ]; then`,
        `  (cd "$ff_p" && find . \\( ${pruneExpr(item.exclude)} \\) -prune -o -print) | while IFS= read -r ff_rel; do ff_rel=\${ff_rel#./}; ff_entry ${name} "$ff_rel" "$ff_p/$ff_rel"; done`,
        `elif [ -e "$ff_p" ] || [ -L "$ff_p" ]; then`,
        `  ff_entry ${name} . "$ff_p"`,
        "fi",
      ];
    }),
  ].join("\n");
};

const parse = (
  facts: ReadonlyArray<unknown>,
  records: Readonly<Record<string, unknown>>,
): FilesObserved => {
  const items = new Map<string, { entries: Map<string, string>; size: number }>();
  for (const raw of facts) {
    const fact = decodeFact(raw);
    if (fact._tag === "None") continue;
    const f = fact.value;
    const item = items.get(f.item) ?? { entries: new Map<string, string>(), size: 0 };
    item.entries.set(f.path, f.entry);
    item.size += f.size;
    items.set(f.item, item);
  }
  const decoded = new Map<string, FileRecord>();
  for (const [name, raw] of Object.entries(records)) {
    const record = decodeRecord(raw);
    if (record._tag === "Some") decoded.set(name, record.value);
  }
  return { items, records: decoded };
};

// Where an entry sits on the Machine, as a shell word.
const at = (rel: string): string => (rel === "." ? `"$ff_p"` : `"$ff_p"/${quote(rel)}`);

// The contents of every file the Starting Machine's copy has, read in one
// local script whose output is never logged: `ff-file <n> <base64>`, by the
// file's index in `files`.
const readContents = (files: ReadonlyArray<{ readonly abs: string }>) =>
  Effect.gen(function* () {
    const contents = new Map<number, Hidden>();
    const script = files
      .map(
        ({ abs }, n) =>
          `ff_b=$(base64 < ${abs}) || exit 1; printf 'ff-file ${n} %s\\n' "$(printf '%s' "$ff_b" | tr -d '\\n')"`,
      )
      .join("\n");
    const code = yield* runScript({ name: "local", local: true }, script, [], (line) =>
      Effect.sync(() => {
        const match = /^ff-file (\d+) (.*)$/.exec(line);
        if (match !== null) contents.set(Number(match[1]), new Hidden(match[2] ?? ""));
      }),
    );
    return code === 0 && contents.size === files.length ? contents : undefined;
  });

// The Starting Machine's own copy of each of its Items: observed like any
// Machine's, then read when it is within the size limit.
const resolveSources = Effect.fn("resolveSources")(function* (
  items: ReadonlyArray<FileItem>,
  scope: Scope,
) {
  const facts: unknown[] = [];
  yield* runScript(
    { name: scope.machine.name, local: true },
    checkScript({ scope, providers: [{ provider: files, items }] }),
    [],
    (line) =>
      Effect.sync(() => {
        const parsed = parseLine(line);
        if (parsed.kind === "state") facts.push(parsed.fact);
      }),
  );
  const state = assembleState(facts);
  const observed = parse(state.facts.files ?? [], state.records.files ?? {});
  const sources = new Map<string, Source>();
  for (const item of items) {
    const copy = observed.items.get(item.name);
    if (!state.complete) {
      sources.set(item.name, { kind: "unreadable", reason: "could not read it here" });
      continue;
    }
    if (copy === undefined) {
      sources.set(item.name, { kind: "missing" });
      continue;
    }
    const unreadable = [...copy.entries].find(([, entry]) => entry === "?")?.[0];
    if (unreadable !== undefined) {
      sources.set(item.name, {
        kind: "unreadable",
        reason: `cannot read ${unreadable === "." ? item.path : unreadable} here`,
      });
      continue;
    }
    if (copy.size > SIZE_LIMIT) {
      sources.set(item.name, {
        kind: "unreadable",
        reason: `${(copy.size / 1024 / 1024).toFixed(1)} MB, over the ${SIZE_LIMIT / 1024 / 1024} MB limit`,
      });
      continue;
    }
    const list = [...copy.entries].flatMap(([rel, entry]) =>
      entry.startsWith("f ")
        ? [
            {
              rel,
              abs: rel === "." ? quotePath(item.path) : `${quotePath(item.path)}/${quote(rel)}`,
            },
          ]
        : [],
    );
    const read = yield* readContents(list);
    if (read === undefined) {
      sources.set(item.name, { kind: "unreadable", reason: "could not read it here" });
      continue;
    }
    const record = observed.records.get(item.name);
    sources.set(item.name, {
      kind: "present",
      entries: copy.entries,
      ...(record === undefined ? {} : { record }),
      contents: new Map(list.map(({ rel }, n) => [rel, read.get(n) ?? new Hidden("")])),
    });
  }
  return sources;
});

// Why a Ship should ask before overwriting `current` on this Machine, if it
// should (ADR 0016).
const askWhy = (
  current: Entries,
  record: FileRecord | undefined,
  source: Extract<Source, { kind: "present" }>,
  from: string,
): string | undefined => {
  if (record === undefined) return "differs, and no Ship wrote it";
  const recorded = recordEntries(record);
  if (fingerprint(recorded) !== fingerprint(current)) {
    const paths =
      current.size === 1 && recorded.size === 1 ? "" : ` (${changedPaths(recorded, current)})`;
    return `was edited there${paths}`;
  }
  const theirs = fingerprint(recorded);
  const ours = source.record === undefined ? undefined : fingerprint(recordEntries(source.record));
  if (theirs !== ours && record.at > (source.record?.at ?? ""))
    return `came from a Ship at ${record.at.slice(0, 16).replace("T", " ")} that ${from} missed`;
  return undefined;
};

const fileQuestion = (subject: string, found: string, problem: string): Question => ({
  kind: "file",
  subject,
  found,
  problem,
  choices: [
    { value: "overwrite", title: "overwrite it with this Machine's copy" },
    { value: "skip", title: "skip on these Machines (leave as is, shown as skipped)" },
  ],
  default: "skip",
});

const decideFile = (
  item: FileItem,
  observed: FilesObserved,
  resolved: FilesResolved,
  ctx: Context,
): Decision<FileChange, FileChange> => {
  const { from } = resolved;
  const source = resolved.sources.get(item.name);
  if (source === undefined)
    return {
      kind: "skip",
      item: item.name,
      reason: `${from} has no Variant for it; ship from a Machine it targets`,
    };
  if (source.kind === "missing") return { kind: "skip", item: item.name, reason: `not on ${from}` };
  if (source.kind === "unreadable")
    return { kind: "fail", item: item.name, reason: `${from}: ${source.reason}` };
  const current = observed.items.get(item.name)?.entries;
  const record = observed.records.get(item.name);
  const ours = fingerprint(source.entries);
  const change: FileChange = {
    item,
    entries: source.entries,
    ...(current === undefined ? {} : { current }),
    contents: source.contents,
    at: resolved.at,
  };
  const recorded = record === undefined ? undefined : fingerprint(recordEntries(record));
  // The same copy: only its record may need writing.
  if (ctx.machine.name === from || (current !== undefined && fingerprint(current) === ours))
    return {
      kind: "leave",
      item: item.name,
      at: short(source.entries),
      ...(recorded === ours ? {} : { upkeep: change }),
    };
  const to = short(source.entries);
  if (current === undefined) return { kind: "change", item: item.name, to, change };
  if (kindOf(current) !== kindOf(source.entries))
    return {
      kind: "fail",
      item: item.name,
      at: short(current),
      reason: `${kindOf(current)} here, ${kindOf(source.entries)} on ${from}`,
    };
  const fromAt = short(current);
  const subject = address("files", item.name);
  const why = askWhy(current, record, source, from);
  if (why === undefined) return { kind: "change", item: item.name, from: fromAt, to, change };
  const answer = ctx.answer("file", subject);
  if (answer === "skip") return { kind: "skip", item: item.name, at: fromAt, reason: why };
  if (answer === "overwrite")
    return { kind: "change", item: item.name, from: fromAt, to, reason: why, change };
  return { kind: "ask", item: item.name, at: fromAt, question: fileQuestion(subject, fromAt, why) };
};

// Writes the record of `entries`, as the last thing a Step does.
const writeRecord = (name: string, entries: Entries, at: string): string[] => {
  const file = recordFile("files", name);
  const temporary = `${recordDir("files")}/${quote(`${name}.json.tmp`)}`;
  return [
    `mkdir -p ${recordDir("files")}`,
    `ff_lit ${quote(jsonRecord({ at, entries: Object.fromEntries(entries) }))} > ${temporary}`,
    `mv -f ${temporary} ${file}`,
  ];
};

// Mirrors the Starting Machine's copy onto the Machine, then writes the
// record. Each file lands in a new temporary file beside it (mktemp creates
// it owner-only before any byte is written), then takes its mode and is
// renamed into place. An entry whose type changed, or that the Starting
// Machine no longer has, is deleted first, one entry at a time: a directory
// only once it is empty, so an excluded path inside it stops the Step rather
// than being deleted. Directories take their modes last, deepest first, so a
// read-only one can still be filled. One `set -e` subshell.
const copyStep = (change: FileChange): Step => {
  const { item, entries, current, contents } = change;
  const typeOf = (entry: string | undefined) => entry?.[0];
  const deletes = [...(current ?? [])]
    .filter(([rel, entry]) => {
      const ours = entries.get(rel);
      return ours === undefined || typeOf(ours) !== typeOf(entry);
    })
    .toSorted(([a], [b]) => depth(b) - depth(a));
  const writes = [...entries]
    .filter(([rel, entry]) => current?.get(rel) !== entry)
    .toSorted(([a], [b]) => depth(a) - depth(b));
  const input: Hidden[] = [];
  const write = ([rel, entry]: [string, string]): string[] => {
    const [type, mode = ""] = entry.split(" ");
    // Owner-only until its own mode is set, last, so nothing inside shows early.
    if (type === "d") return [`(umask 077 && mkdir -p ${at(rel)})`];
    if (type === "l") return [`rm -f ${at(rel)}`, `ln -s -- ${quote(entry.slice(2))} ${at(rel)}`];
    const n = input.push(contents.get(rel) ?? new Hidden("")) - 1;
    return [
      `ff_t=$(mktemp "$(dirname ${at(rel)})/.fftmp.XXXXXX")`,
      `printf '%s' "$ff_input_${n}" | base64 -d > "$ff_t"`,
      `chmod ${mode} "$ff_t"`,
      `mv -f "$ff_t" ${at(rel)}`,
    ];
  };
  const modes = writes
    .filter(([, entry]) => entry.startsWith("d "))
    .toReversed()
    .map(([rel, entry]) => `chmod ${entry.slice(2)} ${at(rel)}`);
  const links = [...entries].filter(([, entry]) => entry.startsWith("l ")).map(([rel]) => rel);
  const reached = short(entries);
  return {
    id: `files:${item.name}:copy`,
    items: [item.name],
    doing: "copying",
    run: [
      `ff_p=${quotePath(item.path)}`,
      "(",
      "  set -e",
      ...[
        `mkdir -p "$(dirname "$ff_p")"`,
        ...deletes.map(([rel, entry]) =>
          entry.startsWith("d ") ? `rmdir ${at(rel)}` : `rm -f ${at(rel)}`,
        ),
        ...writes.flatMap(write),
        ...modes,
        ...writeRecord(item.name, entries, change.at),
      ].map((l) => `  ${l}`),
      ")",
      `ff_rc=$?`,
      // A link whose target is not on this Machine is noted, not failed.
      `if [ "$ff_rc" -eq 0 ]; then`,
      `  ff_dl=""`,
      ...links.map((rel) => `  [ -e ${at(rel)} ] || ff_dl="$ff_dl, "${quote(rel)}`),
      `  if [ -n "$ff_dl" ]; then ff_at files ${quote(item.name)} "${reached}, dangling link: \${ff_dl#, }"; else ff_at files ${quote(item.name)} ${reached}; fi`,
      "fi",
      `(exit "$ff_rc")`,
    ],
    input,
  };
};

// The record alone, for a Machine that already has the copy.
const recordStep = (change: FileChange): Step => ({
  id: `files:${change.item.name}:record`,
  items: [change.item.name],
  doing: "recording",
  run: [
    "(",
    "  set -e",
    ...writeRecord(change.item.name, change.entries, change.at).map((l) => `  ${l}`),
    ")",
  ],
});

export const files: Provider<"files", FileItem, FilesObserved, FilesResolved, FileChange> = {
  name: "files",
  rule: "record",
  dependsOn: [],
  items: (_section, listed) =>
    listed.map(({ name, def }) => ({ name, path: def.path, exclude: def.exclude ?? [] })),
  observe: (items) => observe(items),
  parse,
  // Only the Starting Machine's Items that some checked Machine needs are read.
  resolve: (items, { starting: all }) =>
    Effect.gen(function* () {
      const at = DateTime.formatIso(yield* DateTime.now);
      const needed = new Set(items.map((item) => item.name));
      const starting = { ...all, items: all.items.filter((item) => needed.has(item.name)) };
      const sources =
        starting.items.length === 0
          ? new Map<string, Source>()
          : // A path on a stalled mount must not hold the Ship forever.
            yield* resolveSources(starting.items, starting).pipe(
              Effect.timeout("2 minutes"),
              Effect.orElseSucceed(
                () =>
                  new Map<string, Source>(
                    starting.items.map((item) => [
                      item.name,
                      { kind: "unreadable", reason: "could not read it here" },
                    ]),
                  ),
              ),
            );
      return { from: starting.machine.name, at, sources };
    }),
  decide: ({ items, observed, resolved, ctx }) =>
    items.map((item) => decideFile(item, observed, resolved, ctx)),
  act: (decisions) =>
    decisions.flatMap((d) =>
      d.kind === "change"
        ? [copyStep(d.change)]
        : d.kind === "leave" && d.upkeep !== undefined
          ? [recordStep(d.upkeep)]
          : [],
    ),
};
