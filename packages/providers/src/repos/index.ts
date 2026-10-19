// The repos Provider: each Tracked Repo as a Managed Clone at its ref,
// installed with its Install Command. Kept matching an Install Record on the
// Machine (ADR 0004): a new commit, a moved clone, a changed command or Clone
// Files, or Drift in an Output reinstalls.
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { DEFAULT_CLONE_ROOT, isPin, type FleetConfig, type TrackedRepo } from "@fleetfizz/config";
import {
  address,
  decideInstall,
  variantFor,
  type Context,
  type Decision,
  type InstallRecord,
  type MachineIdentity,
  type Provider,
  type Step,
  type Targeting,
} from "@fleetfizz/core";
import { quote, quotePath, RECORDS_DIR, recordDir, recordFile } from "@fleetfizz/remote";

// A Tracked Repo on one Machine, named by its key in `repos.items`.
export type RepoItem = Omit<TrackedRepo, keyof Targeting> & { readonly name: string };

const RepoFact = Schema.Union([
  Schema.Struct({
    fact: Schema.Literal("cloneRoot"),
    path: Schema.String,
    present: Schema.Boolean,
  }),
  Schema.Struct({
    fact: Schema.Literal("repo"),
    name: Schema.String,
    present: Schema.Boolean,
    head: Schema.optionalKey(Schema.String),
    origin: Schema.optionalKey(Schema.String),
  }),
  // An Output's fingerprint, null when the path is missing.
  Schema.Struct({
    fact: Schema.Literal("output"),
    repo: Schema.String,
    path: Schema.String,
    fingerprint: Schema.NullOr(Schema.String),
  }),
]);
const decodeFact = Schema.decodeUnknownOption(RepoFact);

const InstallRecordSchema = Schema.Struct({
  commit: Schema.String,
  path: Schema.String,
  install: Schema.String,
  outputs: Schema.Record(Schema.String, Schema.String),
});
const decodeRecord = Schema.decodeUnknownOption(InstallRecordSchema);

interface Clone {
  readonly present: boolean;
  readonly head?: string;
  readonly origin?: string;
}

export interface ReposObserved {
  readonly cloneRoot?: { readonly path: string; readonly present: boolean };
  readonly clones: ReadonlyMap<string, Clone>;
  // Repo -> Output path -> fingerprint (undefined when missing).
  readonly outputs: ReadonlyMap<string, ReadonlyMap<string, string | undefined>>;
  // A record that does not decode counts as never installed.
  readonly records: ReadonlyMap<string, InstallRecord>;
}

// The commit a branch is at on origin, or why it could not be read, by
// `branchKey`: Variants of one repo can track different branches.
type ReposResolved = Readonly<
  Record<string, { readonly commit: string } | { readonly error: string }>
>;
const branchKey = (repo: Pick<RepoItem, "origin" | "ref">): string => `${repo.origin}#${repo.ref}`;

export interface RepoChange {
  readonly item: RepoItem;
  readonly root: string;
  readonly commit: string;
}

// The Machine's Clone Root: its Variant of `repos.cloneRoot`, or the default.
const cloneRoot = (config: FleetConfig, machine: MachineIdentity): string => {
  const root = config.repos?.cloneRoot;
  return (
    (root === undefined ? undefined : variantFor(root, machine))?.variant.path ?? DEFAULT_CLONE_ROOT
  );
};

const originUrl = (origin: string): string => `https://github.com/${origin}.git`;

const short = (commit: string): string => commit.slice(0, 7);

const expandHome = (path: string, home: string): string =>
  path === "~" ? home : path.startsWith("~/") ? `${home}${path.slice(1)}` : path;

const jsonString = Schema.encodeSync(Schema.fromJsonString(Schema.String));

// `git ls-remote` for one branch. The Lent Token reaches git through the
// environment, never argv.
const lsRemote = Effect.fn("lsRemote")(function* (repo: RepoItem, token: string | undefined) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const auth =
    token === undefined
      ? []
      : [
          "-c",
          "credential.helper=",
          "-c",
          'credential.helper=!f() { echo username=x-access-token; echo "password=$FF_TOKEN"; }; f',
        ];
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          "git",
          [...auth, "ls-remote", originUrl(repo.origin), `refs/heads/${repo.ref}`],
          {
            stdout: "pipe",
            stderr: "pipe",
            env: { GIT_TERMINAL_PROMPT: "0", ...(token === undefined ? {} : { FF_TOKEN: token }) },
            extendEnv: true,
          },
        ),
      );
      const [stdout, stderr, code] = yield* Effect.all(
        [
          Stream.runCollect(Stream.decodeText(handle.stdout)),
          Stream.runCollect(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      );
      if (code !== 0) {
        const lines = stderr.join("").trim().split("\n");
        return { error: lines[lines.length - 1] || `git ls-remote exited ${code}` };
      }
      const commit = stdout.join("").split(/\s/)[0];
      return commit === undefined || commit === ""
        ? { error: `no branch ${repo.ref} on origin` }
        : { commit };
    }),
  ).pipe(Effect.orElseSucceed(() => ({ error: "could not run git ls-remote" })));
});

const observe = (items: ReadonlyArray<RepoItem>, root: string): string => {
  if (items.length === 0) return "";
  const lines = [
    `ff_root=${quotePath(root)}`,
    `if [ -d "$ff_root" ]; then ff_present=true; else ff_present=false; fi`,
    `ff_state "{\\"provider\\":\\"repos\\",\\"fact\\":\\"cloneRoot\\",\\"path\\":\\"$(ff_json "$ff_root")\\",\\"present\\":$ff_present}"`,
  ];
  for (const repo of items) {
    const name = quote(repo.name);
    lines.push(
      `ff_d="$ff_root"/${name}`,
      `if [ -d "$ff_d/.git" ]; then`,
      `  ff_state "{\\"provider\\":\\"repos\\",\\"fact\\":\\"repo\\",\\"name\\":\\"$(ff_json ${name})\\",\\"present\\":true,\\"head\\":\\"$(ff_json "$(git -C "$ff_d" rev-parse HEAD 2>/dev/null)")\\",\\"origin\\":\\"$(ff_json "$(git -C "$ff_d" remote get-url origin 2>/dev/null)")\\"}"`,
      "else",
      `  ff_state "{\\"provider\\":\\"repos\\",\\"fact\\":\\"repo\\",\\"name\\":\\"$(ff_json ${name})\\",\\"present\\":false}"`,
      "fi",
    );
    for (const output of repo.outputs ?? [])
      lines.push(
        `ff_p=${quotePath(output)}; ff_f=$(ff_fp "$ff_p")`,
        `if [ -n "$ff_f" ]; then ff_fv="\\"$(ff_json "$ff_f")\\""; else ff_fv=null; fi`,
        `ff_state "{\\"provider\\":\\"repos\\",\\"fact\\":\\"output\\",\\"repo\\":\\"$(ff_json ${name})\\",\\"path\\":\\"$(ff_json ${quote(output)})\\",\\"fingerprint\\":$ff_fv}"`,
      );
  }
  return lines.join("\n");
};

const decideRepo = (
  repo: RepoItem,
  root: string,
  observed: ReposObserved,
  resolved: ReposResolved,
  ctx: Context,
): Decision<RepoChange, RepoChange> => {
  const clone = observed.clones.get(repo.name);
  const record = observed.records.get(repo.name);
  const at = clone?.head === undefined ? {} : { at: short(clone.head) };
  const fail = (reason: string): Decision<RepoChange, RepoChange> => ({
    kind: "fail",
    item: repo.name,
    ...at,
    reason,
  });
  // A Clone Root under ~ is created on demand; any other missing root means a
  // volume is not mounted, and fleetfizz never falls back to the internal drive.
  if (observed.cloneRoot?.present === false && !root.startsWith("~"))
    return fail(`clone root not mounted: ${observed.cloneRoot.path}`);
  const url = originUrl(repo.origin);
  if (clone?.present && clone.origin !== undefined && clone.origin !== url)
    return fail(`managed clone has origin ${clone.origin}, expected ${url}`);
  const target = isPin(repo.ref) ? { commit: repo.ref } : resolved[branchKey(repo)];
  if (target === undefined) return fail(`could not resolve ${repo.ref}`);
  if ("error" in target) return fail(target.error);
  const { commit } = target;
  const outputs = observed.outputs.get(repo.name);
  const install = decideInstall(
    record,
    {
      commit,
      path: expandHome(`${root}/${repo.name}`, ctx.home),
      install: repo.install,
      outputs: Object.fromEntries((repo.outputs ?? []).map((o) => [o, outputs?.get(o)])),
    },
    ctx.rebuild(address("repos", repo.name)),
  );
  const reason = install.run
    ? install.reason
    : !clone?.present
      ? "not cloned"
      : clone.head !== commit
        ? `checked out at ${short(clone.head ?? "")}`
        : undefined;
  const change = { item: repo, root, commit };
  // An up-to-date clone is still reset and cleaned on every Ship (ADR 0002).
  if (reason === undefined)
    return { kind: "leave", item: repo.name, at: short(commit), upkeep: change };
  const from = record?.commit ?? clone?.head;
  return {
    kind: "change",
    item: repo.name,
    ...(from === undefined ? {} : { from: short(from) }),
    to: short(commit),
    reason,
    change,
  };
};

// Brings the Managed Clone to the commit: clone when missing, check the
// origin, reset, and clean. One `set -e` subshell.
const fetchStep = ({ item, root, commit }: RepoChange): Step => {
  const url = originUrl(item.origin);
  const sync = isPin(item.ref)
    ? [
        `if [ "$(git -C "$ff_d" rev-parse HEAD)" != ${quote(commit)} ]; then ff_git -C "$ff_d" fetch --quiet origin ${quote(commit)}; fi`,
        `git -C "$ff_d" checkout --quiet --detach ${quote(commit)}`,
        `git -C "$ff_d" reset --quiet --hard ${quote(commit)}`,
      ]
    : [
        `ff_git -C "$ff_d" fetch --quiet origin ${quote(item.ref)}`,
        // The commit resolved for this Ship, not origin's tip now.
        `git -C "$ff_d" reset --quiet --hard ${quote(commit)}`,
      ];
  return {
    id: `repos:${item.name}:fetch`,
    items: [item.name],
    doing: "fetching",
    run: [
      `ff_root=${quotePath(root)}`,
      ...(root.startsWith("~") ? [`mkdir -p "$ff_root"`] : []),
      `ff_d="$ff_root"/${quote(item.name)}`,
      "(",
      "  set -e",
      `  if [ ! -d "$ff_d/.git" ]; then ff_git clone --quiet ${quote(url)} "$ff_d"; fi`,
      `  if [ "$(git -C "$ff_d" remote get-url origin)" != ${quote(url)} ]; then echo "origin is $(git -C "$ff_d" remote get-url origin), expected ${url}"; exit 1; fi`,
      ...[...sync, `git -C "$ff_d" clean --quiet -fd`].map((l) => `  ${l}`),
      ")",
    ],
  };
};

// Runs the Install Command, then writes the Install Record. The install
// counts only once its record is on disk. The record's `set -e` subshell
// stands alone: on the left of `||` the shell would ignore its `set -e`.
const installStep = ({ item, root }: RepoChange, ctx: Context): Step => {
  const env = [
    `FLEETFIZZ_MACHINE=${quote(ctx.machine.name)}`,
    `FLEETFIZZ_PLATFORM=${quote(ctx.machine.platform)}`,
    `FLEETFIZZ_MACHINES=${quote(ctx.config.machines.join(","))}`,
  ].join(" ");
  const tmp = `${recordDir("repos")}/${quote(`${item.name}.json.tmp`)}`;
  // Fingerprints are taken now, so the next Check compares against what this
  // install produced.
  const record = [
    `ff_after=$(git -C "$ff_d" rev-parse HEAD)`,
    `ff_outs=""`,
    ...(item.outputs ?? []).map(
      (o) =>
        `ff_fpv=$(ff_fp ${quotePath(o)}); if [ -n "$ff_fpv" ]; then ff_outs="$ff_outs,\\"$(ff_json ${quote(o)})\\":\\"$(ff_json "$ff_fpv")\\""; fi`,
    ),
    `mkdir -p ${recordDir("repos")}`,
    `printf '%s\\n' "{\\"commit\\":\\"$ff_after\\",\\"path\\":\\"$(ff_json "$ff_d")\\",\\"install\\":$(ff_lit ${quote(jsonString(item.install))}),\\"outputs\\":{\${ff_outs#,}}}" > ${tmp}`,
    `mv -f ${tmp} ${recordFile("repos", item.name)}`,
    // The record from before Providers, now superseded.
    `rm -f ${quotePath(RECORDS_DIR)}/${quote(`${item.name}.json`)}`,
  ];
  return {
    id: `repos:${item.name}:install`,
    items: [item.name],
    doing: "installing",
    run: [
      `ff_root=${quotePath(root)}`,
      `ff_d="$ff_root"/${quote(item.name)}`,
      `(cd "$ff_d" && ${env} "\${SHELL:-/bin/sh}" -lc ${quote(item.install)})`,
      `ff_rc=$?`,
      `if [ "$ff_rc" -eq 0 ]; then`,
      "  (",
      "    set -e",
      ...record.map((l) => `    ${l}`),
      "  )",
      `  ff_rc=$?`,
      `  if [ "$ff_rc" -ne 0 ]; then echo "could not write the install record"; fi`,
      "fi",
      `(exit "$ff_rc")`,
    ],
  };
};

export const repos: Provider<"repos", RepoItem, ReposObserved, ReposResolved, RepoChange> = {
  name: "repos",
  rule: "record",
  // Install Commands need pnpm and Node.
  dependsOn: ["vp"],
  items: (_section, listed) => listed.map(({ name, def }) => ({ ...def, name })),
  observe: (items, scope) => observe(items, cloneRoot(scope.config, scope.machine)),
  parse(facts, records) {
    let root: ReposObserved["cloneRoot"];
    const clones = new Map<string, Clone>();
    const outputs = new Map<string, Map<string, string | undefined>>();
    for (const raw of facts) {
      const fact = decodeFact(raw);
      if (fact._tag === "None") continue;
      const f = fact.value;
      switch (f.fact) {
        case "cloneRoot":
          root = { path: f.path, present: f.present };
          break;
        case "repo":
          clones.set(f.name, {
            present: f.present,
            ...(f.head === undefined || f.head === "" ? {} : { head: f.head }),
            ...(f.origin === undefined || f.origin === "" ? {} : { origin: f.origin }),
          });
          break;
        case "output": {
          const paths = outputs.get(f.repo) ?? new Map<string, string | undefined>();
          paths.set(f.path, f.fingerprint ?? undefined);
          outputs.set(f.repo, paths);
          break;
        }
      }
    }
    const decoded = new Map<string, InstallRecord>();
    for (const [name, raw] of Object.entries(records)) {
      const record = decodeRecord(raw);
      if (record._tag === "Some") decoded.set(name, record.value);
    }
    return {
      ...(root === undefined ? {} : { cloneRoot: root }),
      clones,
      outputs,
      records: decoded,
    };
  },
  resolve: (items, { token }) =>
    Effect.forEach(
      [...new Map(items.filter((r) => !isPin(r.ref)).map((r) => [branchKey(r), r])).entries()],
      ([key, repo]) => lsRemote(repo, token).pipe(Effect.map((result) => [key, result] as const)),
      { concurrency: 8 },
    ).pipe(Effect.map((entries): ReposResolved => Object.fromEntries(entries))),
  decide: ({ items, observed, resolved, ctx }) => {
    const root = cloneRoot(ctx.config, ctx.machine);
    return items.map((repo) => decideRepo(repo, root, observed, resolved, ctx));
  },
  act: (decisions, ctx) =>
    decisions.flatMap((d) =>
      d.kind === "change"
        ? [fetchStep(d.change), installStep(d.change, ctx)]
        : d.kind === "leave" && d.upkeep !== undefined
          ? [fetchStep(d.upkeep)]
          : [],
    ),
};
