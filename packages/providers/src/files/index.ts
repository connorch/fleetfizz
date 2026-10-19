// The files Provider: each Shared File, a file or directory copied from the
// Starting Machine to every targeted Machine (ADR 0016). A directory is
// mirrored. Kept matching an Install Record on each Machine: the entries of
// the last copy a Ship wrote there, so an edit made there (Drift) or a newer
// copy from another Ship asks before it is overwritten.
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Hash from "effect/Hash";
import * as Schema from "effect/Schema";
import type { ChildProcessSpawner } from "effect/process";

import type { SharedFile } from "@fleetfizz/config";
import {
  address,
  assembleState,
  Hidden,
  type Checked,
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
  prelude,
  quote,
  quotePath,
  recordDir,
  recordFile,
  runScript,
  SSH_UNREACHABLE,
  stepScript,
  stepStdin,
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

const FileFact = Schema.Union([
  Schema.Struct({
    fact: Schema.Literal("entry"),
    item: Schema.String,
    path: Schema.String,
    entry: Schema.String,
    size: Schema.Number,
  }),
  // Whether the Machine can encrypt a copy for a pull.
  Schema.Struct({ fact: Schema.Literal("openssl"), present: Schema.Boolean }),
]);
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
  readonly openssl: boolean;
}

// The Starting Machine's copy of one Item, at its own Variant's path.
type Source = { readonly item: FileItem } & (
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable"; readonly reason: string }
  | {
      readonly kind: "present";
      readonly entries: Entries;
      readonly record?: FileRecord;
      // Each file entry's contents, base64.
      readonly contents: ReadonlyMap<string, Hidden>;
    }
);

// Another checked Machine's copy of an Item, which a Ship can pull.
interface Copy {
  readonly machine: string;
  readonly item: FileItem;
  readonly entries: Entries;
  readonly record?: FileRecord;
  readonly openssl: boolean;
}

export interface FilesResolved {
  // The Starting Machine.
  readonly from: string;
  // This Ship's time, which every record it writes carries.
  readonly at: string;
  // By Item. An Item the Starting Machine has no Variant for is absent.
  readonly sources: ReadonlyMap<string, Source>;
  // By Item, every other checked Machine that has it within the size limit.
  readonly copies: ReadonlyMap<string, ReadonlyArray<Copy>>;
  // The Starting Machine has openssl, which a pull decrypts with.
  readonly openssl: boolean;
}

export interface FileChange {
  readonly item: FileItem;
  readonly entries: Entries;
  // What the Machine has now, undefined when the Item is missing there.
  readonly current?: Entries;
  readonly contents: ReadonlyMap<string, Hidden>;
  readonly at: string;
  // For a pulled copy: the key `contents` are encrypted with.
  readonly key?: Hidden;
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
  ({ f: "a file", d: "a directory", l: "a symlink", "?": "something it cannot copy" })[
    entries.get(".")?.[0] ?? ""
  ] ?? "missing";

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
  `ff_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }`,
  // ff_entry item rel abs
  `ff_entry() {`,
  `  if [ -L "$3" ]; then ff_e="l $(readlink "$3")"; ff_s=0`,
  // One this user cannot read, or that is no file, directory or link (a
  // socket, a FIFO), is "?": unknown, never absent, so it is never replaced
  // unasked.
  `  elif [ -d "$3" ]; then if [ -r "$3" ] && [ -x "$3" ]; then ff_e="d $(ff_mode "$3")"; else ff_e="?"; fi; ff_s=0`,
  `  elif [ -f "$3" ]; then if [ -r "$3" ]; then ff_e="f $(ff_mode "$3") $(ff_sha < "$3")"; ff_s=$(wc -c < "$3" | tr -d " "); else ff_e="?"; ff_s=0; fi`,
  `  else ff_e="?"; ff_s=0; fi`,
  `  ff_state "{\\"provider\\":\\"files\\",\\"fact\\":\\"entry\\",\\"item\\":\\"$(ff_json "$1")\\",\\"path\\":\\"$(ff_json "$2")\\",\\"entry\\":\\"$(ff_json "$ff_e")\\",\\"size\\":$ff_s}"`,
  `}`,
].join("\n");

const pruneExpr = (exclude: ReadonlyArray<string>): string =>
  [...ALWAYS_EXCLUDED, ...exclude]
    .map((pattern) =>
      pattern.includes("/")
        ? `-path ${quote(`./${pattern.replace(/^(\.?\/)+|\/+$/g, "")}`)}`
        : `-name ${quote(pattern)}`,
    )
    .join(" -o ");

const observe = (items: ReadonlyArray<FileItem>): string => {
  if (items.length === 0) return "";
  return [
    SHELL_FNS,
    `if command -v openssl >/dev/null 2>&1; then ff_o=true; else ff_o=false; fi`,
    `ff_state "{\\"provider\\":\\"files\\",\\"fact\\":\\"openssl\\",\\"present\\":$ff_o}"`,
    ...items.flatMap((item) => {
      const name = quote(item.name);
      return [
        `ff_p=${quotePath(item.path)}`,
        `if [ -d "$ff_p" ] && [ ! -L "$ff_p" ]; then`,
        // The directory itself is never excluded, even by a pattern like ".*".
        `  ff_entry ${name} . "$ff_p"`,
        `  (cd "$ff_p" && find . -mindepth 1 \\( ${pruneExpr(item.exclude)} \\) -prune -o -print) | while IFS= read -r ff_rel; do ff_rel=\${ff_rel#./}; ff_entry ${name} "$ff_rel" "$ff_p/$ff_rel"; done`,
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
  let openssl = false;
  for (const raw of facts) {
    const fact = decodeFact(raw);
    if (fact._tag === "None") continue;
    const f = fact.value;
    if (f.fact === "openssl") {
      openssl = f.present;
      continue;
    }
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
  return { items, records: decoded, openssl };
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
      sources.set(item.name, { item, kind: "unreadable", reason: "could not read it here" });
      continue;
    }
    if (copy === undefined) {
      sources.set(item.name, { item, kind: "missing" });
      continue;
    }
    const unreadable = [...copy.entries].find(([, entry]) => entry === "?")?.[0];
    if (unreadable !== undefined) {
      sources.set(item.name, {
        item,
        kind: "unreadable",
        reason: `cannot read or copy ${unreadable === "." ? item.path : unreadable} here`,
      });
      continue;
    }
    if (copy.size > SIZE_LIMIT) {
      sources.set(item.name, {
        item,
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
      sources.set(item.name, { item, kind: "unreadable", reason: "could not read it here" });
      continue;
    }
    const record = observed.records.get(item.name);
    sources.set(item.name, {
      item,
      kind: "present",
      entries: copy.entries,
      ...(record === undefined ? {} : { record }),
      contents: new Map(list.map(({ rel }, n) => [rel, read.get(n) ?? new Hidden("")])),
    });
  }
  return { sources, openssl: observed.openssl };
});

// Every checked Machine's copy of each Item, but the Starting Machine's own,
// and any that could not be pulled whole: over the size limit, or with a
// path that Machine cannot read.
const copiesOf = (
  checked: ReadonlyArray<Checked<FileItem>>,
  from: string,
): ReadonlyMap<string, ReadonlyArray<Copy>> => {
  const copies = new Map<string, Copy[]>();
  for (const { machine, items, facts, records } of checked) {
    if (machine.name === from) continue;
    const observed = parse(facts, records);
    for (const item of items) {
      const copy = observed.items.get(item.name);
      if (copy === undefined || copy.size > SIZE_LIMIT || [...copy.entries.values()].includes("?"))
        continue;
      const record = observed.records.get(item.name);
      copies.set(item.name, [
        ...(copies.get(item.name) ?? []),
        {
          machine: machine.name,
          item,
          entries: copy.entries,
          ...(record === undefined ? {} : { record }),
          openssl: observed.openssl,
        },
      ]);
    }
  }
  return copies;
};

// The answer that pulls a Machine's copy to the Starting Machine.
const PULL = "pull:";
// The choice that shows the diff from a Machine's copy to the Starting Machine's.
const DIFF = "diff:";

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

// Overwrite or skip, or take that Machine's copy instead when it can be pulled.
const fileQuestion = (
  subject: string,
  found: string,
  problem: string,
  pull: Copy | undefined,
  from: string,
): Question => ({
  kind: "file",
  subject,
  found,
  problem,
  choices: [
    { value: "overwrite", title: "overwrite it with this Machine's copy" },
    ...(pull === undefined || !pull.openssl
      ? []
      : [
          {
            value: `${PULL}${pull.machine}`,
            title: `use ${pull.machine}'s copy (${short(pull.entries)}) on ${from} instead`,
          },
        ]),
    { value: "skip", title: "skip on these Machines (leave as is, shown as skipped)" },
  ],
  default: "skip",
  ...(pull === undefined || !pull.openssl
    ? {}
    : {
        diffs: [
          {
            value: `${DIFF}${pull.machine}`,
            title: `view the diff from ${pull.machine}'s copy to this Machine's`,
          },
        ],
      }),
});

// For an Item the Starting Machine lacks: pull one of the other Machines'
// copies, Machines with the same copy as one choice, or skip.
const missingQuestion = (
  subject: string,
  found: string,
  copies: ReadonlyArray<Copy>,
  from: string,
): Question => ({
  kind: "file",
  subject,
  found,
  problem: `is not on ${from}`,
  choices: [
    ...Map.groupBy(
      copies.filter((c) => c.openssl),
      (c) => fingerprint(c.entries),
    )
      .values()
      .flatMap((same) => {
        const [first] = same;
        return first === undefined
          ? []
          : [
              {
                value: `${PULL}${first.machine}`,
                title: `pull ${short(first.entries)} from ${same.map((c) => c.machine).join(", ")}`,
              },
            ];
      }),
    { value: "skip", title: "skip it everywhere" },
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
  const subject = address("files", item.name);
  const answer = ctx.answer("file", subject);
  const pulling = answer?.startsWith(PULL) === true;
  const copies = resolved.copies.get(item.name) ?? [];
  const mine = copies.find((c) => c.machine === ctx.machine.name);
  if (source.kind === "missing") {
    const notHere = { kind: "skip", item: item.name, reason: `not on ${from}` } as const;
    if (mine === undefined) return notHere;
    if (pulling)
      return {
        ...notHere,
        at: short(mine.entries),
        reason: `pulling it from ${answer?.slice(PULL.length)}`,
      };
    if (answer === "skip" || !resolved.openssl || !copies.some((c) => c.openssl)) {
      const without = resolved.openssl
        ? copies.filter((c) => !c.openssl).map((c) => c.machine)
        : [from];
      return {
        ...notHere,
        at: short(mine.entries),
        ...(answer !== "skip" && without.length > 0
          ? { reason: `not on ${from}; install openssl on ${without.join(", ")} to pull it` }
          : {}),
      };
    }
    return {
      kind: "ask",
      item: item.name,
      at: short(mine.entries),
      question: missingQuestion(subject, short(mine.entries), copies, from),
    };
  }
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
  const why = askWhy(current, record, source, from);
  if (why === undefined) return { kind: "change", item: item.name, from: fromAt, to, change };
  if (pulling)
    return {
      kind: "skip",
      item: item.name,
      at: fromAt,
      reason: `pulling it from ${answer?.slice(PULL.length)}`,
    };
  if (answer === "skip") return { kind: "skip", item: item.name, at: fromAt, reason: why };
  if (answer === "overwrite")
    return { kind: "change", item: item.name, from: fromAt, to, reason: why, change };
  return {
    kind: "ask",
    item: item.name,
    at: fromAt,
    question: fileQuestion(subject, fromAt, why, resolved.openssl ? mine : undefined, from),
  };
};

// How a pulled copy is encrypted: the same in LibreSSL (macOS) and OpenSSL,
// base64 on one line.
const CIPHER = "-aes-256-cbc -pbkdf2 -a -A";

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
  // A pulled copy arrives encrypted (pullScript), so it is decrypted as it lands.
  const input: Hidden[] = change.key === undefined ? [] : [change.key];
  const decode =
    change.key === undefined
      ? "base64 -d"
      : `FF_KEY="$ff_input_0" openssl enc -d ${CIPHER} -pass env:FF_KEY`;
  const write = ([rel, entry]: [string, string]): string[] => {
    const [type, mode = ""] = entry.split(" ");
    // Owner-only until its own mode is set, last, so nothing inside shows early.
    if (type === "d") return [`(umask 077 && mkdir -p ${at(rel)})`];
    if (type === "l") return [`rm -f ${at(rel)}`, `ln -s -- ${quote(entry.slice(2))} ${at(rel)}`];
    const n = input.push(contents.get(rel) ?? new Hidden("")) - 1;
    return [
      `ff_t=$(mktemp "$(dirname ${at(rel)})/.fftmp.XXXXXX")`,
      `printf '%s' "$ff_input_${n}" | ${decode} > "$ff_t"`,
      `chmod ${mode} "$ff_t"`,
      `mv -f "$ff_t" ${at(rel)}`,
      `ff_t=""`,
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
      // A temporary file that never landed (a failed or interrupted copy) is
      // removed, so no partial copy of a secret is left beside the path.
      `  ff_t=""`,
      `  trap '[ -z "$ff_t" ] || rm -f "$ff_t"' EXIT`,
      `  trap 'exit 1' HUP INT TERM`,
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

// Fetches `rels`, files of `copy`, from its Machine. Each is encrypted there
// with a one-time key sent on stdin, so what comes back on stdout (which
// session recording would capture) is ciphertext, decrypted by whatever
// writes it on the Starting Machine with the returned key. Never logged.
type Fetched =
  | { readonly key: Hidden; readonly contents: ReadonlyMap<string, Hidden> }
  | { readonly error: string };
const fetchFiles = (copy: Copy, rels: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const key = [...globalThis.crypto.getRandomValues(new Uint8Array(32))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const contents = new Map<number, Hidden>();
    let finished = false;
    const code = yield* runScript(
      { name: copy.machine, local: false },
      [
        // The Check's PATH, which found openssl there.
        prelude,
        `IFS= read -r FF_KEY || FF_KEY=""`,
        "export FF_KEY",
        `ff_p=${quotePath(copy.item.path)}`,
        ...rels.map(
          (rel, n) =>
            `ff_c=$(openssl enc ${CIPHER} -pass env:FF_KEY -in ${at(rel)}) || exit 1; printf 'ff-file ${n} %s\\n' "$ff_c"`,
        ),
        `printf 'ff-pulled\\n'`,
      ].join("\n"),
      [key],
      (line) =>
        Effect.sync(() => {
          const match = /^ff-file (\d+) (.*)$/.exec(line);
          if (match !== null) contents.set(Number(match[1]), new Hidden(match[2] ?? ""));
          else if (line === "ff-pulled") finished = true;
        }),
    );
    const fetched: Fetched =
      !finished || contents.size !== rels.length
        ? {
            error:
              code === SSH_UNREACHABLE
                ? `could not reach ${copy.machine}`
                : `could not read its copy on ${copy.machine}`,
          }
        : {
            key: new Hidden(key),
            contents: new Map(rels.map((rel, n) => [rel, contents.get(n) ?? new Hidden("")])),
          };
    return fetched;
  });

// Runs `step` on the Starting Machine; true when it finished.
const runHere = (from: string, step: Step) =>
  Effect.gen(function* () {
    let ok = false;
    yield* runScript({ name: from, local: true }, stepScript(step), stepStdin(step), (line) =>
      Effect.sync(() => {
        const parsed = parseLine(line);
        if (parsed.kind === "done" && parsed.done.id === step.id) ok = parsed.done.ok;
      }),
    );
    return ok;
  });

// Pulls `machine`'s copy of an Item to the Starting Machine (ADR 0016),
// encrypted on the way (fetchFiles), with the record that Machine has, so
// the next Ship sees one copy on both.
const pull = (
  name: string,
  machine: string,
  resolved: FilesResolved,
): Effect.Effect<
  { readonly done: string } | { readonly error: string },
  never,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const source = resolved.sources.get(name);
    const copy = resolved.copies.get(name)?.find((c) => c.machine === machine);
    if (source === undefined || copy === undefined || source.kind === "unreadable")
      return { error: `cannot pull ${machine}'s copy here` };
    const fetched = yield* fetchFiles(
      copy,
      [...copy.entries].flatMap(([rel, entry]) => (entry.startsWith("f ") ? [rel] : [])),
    );
    if ("error" in fetched) return fetched;
    const step = copyStep({
      item: source.item,
      entries: copy.entries,
      ...(source.kind === "present" ? { current: source.entries } : {}),
      contents: fetched.contents,
      at: copy.record?.at ?? resolved.at,
      key: fetched.key,
    });
    return (yield* runHere(resolved.from, step))
      ? { done: `pulled ${short(copy.entries)} from ${machine}` }
      : { error: `could not write ${machine}'s copy on ${resolved.from}` };
  }).pipe(Effect.catch((e) => Effect.succeed({ error: e.message })));

// One side of a diff: a Machine's copy, its files' contents (base64, or
// encrypted with `key` when fetched from another Machine).
export interface DiffSide {
  readonly machine: string;
  readonly entries: Entries;
  readonly contents: ReadonlyMap<string, Hidden>;
  readonly key?: Hidden;
}

// The paths whose entries differ between two copies.
const differing = (a: Entries, b: Entries): ReadonlyArray<string> =>
  [...new Set([...a.keys(), ...b.keys()])].filter((rel) => a.get(rel) !== b.get(rel)).toSorted();

// Writes each side's version of the paths that differ at
// `<dir>/<machine>/<item>`, files with their modes and links as links, so
// `git diff --no-index old new` shows exactly what differs. A directory is
// written only to hold what differs: git compares files.
export const diffStep = (input: {
  readonly name: string;
  readonly dir: string;
  readonly old: DiffSide;
  readonly new: DiffSide;
}): Step => {
  const rels = differing(input.old.entries, input.new.entries);
  const inputs: Hidden[] = [];
  const side = (s: DiffSide): string[] => {
    const decode =
      s.key === undefined
        ? "base64 -d"
        : `FF_KEY="$ff_input_${inputs.push(s.key) - 1}" openssl enc -d ${CIPHER} -pass env:FF_KEY`;
    return [
      `ff_p=${quote(`${input.dir}/${s.machine}/${input.name}`)}`,
      kindOf(s.entries) === "a directory" ? `mkdir -p "$ff_p"` : `mkdir -p "$(dirname "$ff_p")"`,
      ...rels.flatMap((rel) => {
        const entry = s.entries.get(rel);
        if (entry?.startsWith("l "))
          return [
            `mkdir -p "$(dirname ${at(rel)})"`,
            `ln -s -- ${quote(entry.slice(2))} ${at(rel)}`,
          ];
        if (!entry?.startsWith("f ")) return [];
        const n = inputs.push(s.contents.get(rel) ?? new Hidden("")) - 1;
        return [
          `mkdir -p "$(dirname ${at(rel)})"`,
          `printf '%s' "$ff_input_${n}" | ${decode} > ${at(rel)}`,
          `chmod ${entry.split(" ")[1] ?? ""} ${at(rel)}`,
        ];
      }),
    ];
  };
  const run = [...side(input.old), ...side(input.new)];
  return {
    id: `files:${input.name}:diff`,
    items: [input.name],
    doing: "diffing",
    run: ["(", "  set -e", ...run.map((l) => `  ${l}`), ")"],
    input: inputs,
  };
};

// The two sides of the diff from `machine`'s copy of an Item to the Starting
// Machine's, written under `dir`. Only the files that differ cross, as in a
// pull (fetchFiles); the Starting Machine's come from the copy it read.
const diff = (
  name: string,
  machine: string,
  resolved: FilesResolved,
  dir: string,
): Effect.Effect<
  { readonly old: string; readonly new: string } | { readonly error: string },
  never,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const source = resolved.sources.get(name);
    const copy = resolved.copies.get(name)?.find((c) => c.machine === machine);
    if (source?.kind !== "present" || copy === undefined)
      return { error: `cannot diff ${machine}'s copy here` };
    const fetched = yield* fetchFiles(
      copy,
      differing(copy.entries, source.entries).filter(
        (rel) => copy.entries.get(rel)?.startsWith("f ") === true,
      ),
    );
    if ("error" in fetched) return fetched;
    const step = diffStep({
      name,
      dir,
      old: { machine, entries: copy.entries, contents: fetched.contents, key: fetched.key },
      new: { machine: resolved.from, entries: source.entries, contents: source.contents },
    });
    return (yield* runHere(resolved.from, step))
      ? { old: machine, new: resolved.from }
      : { error: `could not write the diff on ${resolved.from}` };
  }).pipe(Effect.catch((e) => Effect.succeed({ error: e.message })));

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
  resolve: (items, { starting: all, checked }) =>
    Effect.gen(function* () {
      const at = DateTime.formatIso(yield* DateTime.now);
      const needed = new Set(items.map((item) => item.name));
      const starting = { ...all, items: all.items.filter((item) => needed.has(item.name)) };
      const { sources, openssl } =
        starting.items.length === 0
          ? { sources: new Map<string, Source>(), openssl: false }
          : // A path on a stalled mount must not hold the Ship forever.
            yield* resolveSources(starting.items, starting).pipe(
              Effect.timeout("2 minutes"),
              Effect.orElseSucceed(() => ({
                sources: new Map<string, Source>(
                  starting.items.map((item) => [
                    item.name,
                    { item, kind: "unreadable", reason: "could not read it here" },
                  ]),
                ),
                openssl: false,
              })),
            );
      return {
        from: starting.machine.name,
        at,
        sources,
        copies: copiesOf(checked, starting.machine.name),
        openssl,
      };
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
  adopt: (item, answer, resolved) =>
    answer.startsWith(PULL) ? pull(item, answer.slice(PULL.length), resolved) : undefined,
  diff: (item, choice, resolved, dir) =>
    choice.startsWith(DIFF) ? diff(item, choice.slice(DIFF.length), resolved, dir) : undefined,
};
