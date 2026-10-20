// The skills Provider: agent skills, installed with the skills CLI (ADR
// 0018). The CLI does every install, `skills add`, and keeps its own lock of
// each skill's source, ref, and folder hash; fleetfizz never writes a
// skill's folder or the lock. Its own Install Record holds only the agents
// a Ship installed the skill for, which the CLI does not record. A skill
// from GitHub follows its ref like a Tracked Repo: the Starting Machine reads
// the folder's git tree hash at the ref once per Ship, and a Machine whose
// lock has another hash installs it again.
import * as Effect from "effect/Effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import * as Schema from "effect/Schema";

import { isPin } from "@fleetfizz/config";
import {
  address,
  targets,
  variantFor,
  type Context,
  type Decision,
  type Provider,
  type Question,
  type Step,
} from "@fleetfizz/core";
import { quote, recordDir } from "@fleetfizz/remote";

import { OBSERVE, REPORT } from "./scripts.ts";

// A skill on one Machine, named by its key in `skills.items`, with the agents
// it is for: its own, or the section's.
export interface SkillItem {
  readonly name: string;
  readonly source: string;
  readonly ref?: string;
  readonly agents: ReadonlyArray<string>;
}

// A skill's entry in the CLI's lock. `hash` is the skill folder's git tree
// hash for a GitHub source, and a content hash for any other.
const LockEntry = Schema.Struct({
  source: Schema.String,
  sourceType: Schema.String,
  ref: Schema.optionalKey(Schema.String),
  skillPath: Schema.optionalKey(Schema.String),
  hash: Schema.optionalKey(Schema.String),
});
type LockEntry = typeof LockEntry.Type;

const SkillsFact = Schema.Union([
  Schema.Struct({ fact: Schema.Literal("cli"), present: Schema.Boolean }),
  // `skills ls` failed, usually for an agent id the CLI does not know.
  Schema.Struct({ fact: Schema.Literal("error"), error: Schema.String }),
  Schema.Struct({
    fact: Schema.Literal("skill"),
    name: Schema.String,
    // The folder, when one is installed for any agent.
    path: Schema.optionalKey(Schema.String),
    // The folder's git tree hash, taken only for a GitHub source.
    hash: Schema.optionalKey(Schema.String),
    lock: Schema.optionalKey(LockEntry),
  }),
]);
const decodeFact = Schema.decodeUnknownOption(SkillsFact);

// The agents the last Ship's install was for.
const SkillRecord = Schema.Struct({ agents: Schema.Array(Schema.String) });
const decodeRecord = Schema.decodeUnknownOption(SkillRecord);

interface Installed {
  readonly path?: string;
  readonly hash?: string;
  readonly lock?: LockEntry;
}

export interface SkillsObserved {
  // Whether the skills CLI (and Node, which it runs on) is on the Machine.
  readonly cli: boolean;
  // Why the CLI could not list the skills, such as an unknown agent id.
  readonly error?: string;
  readonly skills: ReadonlyMap<string, Installed>;
  // By skill: the agents a Ship installed it for.
  readonly records: ReadonlyMap<string, ReadonlyArray<string>>;
}

// By `repoKey`: the skill folders' git tree hashes in the repo at the ref, by
// folder ("" is the repo's root), or why GitHub could not say.
export type SkillsResolved = Readonly<
  Record<string, { readonly folders: ReadonlyMap<string, string> } | { readonly error: string }>
>;

export interface SkillChange {
  readonly item: SkillItem;
}

const NO_CLI = "the skills CLI is not installed; add skills to vp.items";

// Whether vp installs the skills CLI on this Machine: its section and its
// `skills` Global both target it. Skills then wait for the next Ship, whose
// Check can see their folders through the CLI before anything replaces one.
const vpInstallsCli = (ctx: Context): boolean => {
  const vp = ctx.config.vp;
  const global = vp?.items?.skills;
  return (
    vp !== undefined &&
    global !== undefined &&
    targets(vp, ctx.machine) &&
    variantFor(global, ctx.machine) !== undefined
  );
};

const short = (hash: string): string => hash.slice(0, 7);

// A GitHub `owner/repo` source and the ref a Ship keeps it at: the Item's
// `ref`, a `#ref` in the source, or the repo's default branch (undefined).
// Every other form the CLI takes (a URL, a path) is installed when missing
// and never checked.
const githubSource = (
  item: SkillItem,
): { readonly repo: string; readonly ref?: string } | undefined => {
  const match = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:#(.+))?$/.exec(item.source);
  if (match?.[1] === undefined) return undefined;
  const ref = item.ref ?? match[2];
  return { repo: match[1], ...(ref === undefined ? {} : { ref }) };
};

const repoKey = (repo: string, ref: string | undefined): string =>
  `${repo.toLowerCase()}#${ref ?? ""}`;

// What `skills add` installs from: the source, with the Item's ref as `#ref`.
const installSource = (item: SkillItem): string =>
  item.ref === undefined ? item.source : `${item.source}#${item.ref}`;

// The folder a lock's `skillPath` (its SKILL.md) names, as the CLI reads it.
const folderOf = (skillPath: string): string =>
  skillPath
    .replaceAll("\\", "/")
    .replace(/(^|\/)skill\.md$/i, "")
    .replace(/\/$/, "");

const TreeResponse = Schema.Struct({
  sha: Schema.String,
  tree: Schema.Array(
    Schema.Struct({ path: Schema.String, type: Schema.String, sha: Schema.String }),
  ),
});

// Every folder's git tree hash in `repo` at `ref`, from one GitHub API call,
// as the CLI reads the hash it records. The Lent Token authenticates it, so
// private repos resolve and the rate limit is the user's.
const fetchFolders = Effect.fn("fetchFolders")(
  function* (repo: string, ref: string | undefined, token: string | undefined) {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(
        `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(ref ?? "HEAD")}?recursive=1`,
      ).pipe(
        HttpClientRequest.setHeaders({
          Accept: "application/vnd.github+json",
          "User-Agent": "fleetfizz",
        }),
        (request) =>
          token === undefined ? request : HttpClientRequest.bearerToken(request, token),
      ),
    );
    if (response.status === 404)
      return { error: `no ${ref ?? "default branch"} in ${repo}, or no access to it` };
    if (response.status !== 200) return { error: `GitHub answered ${response.status}` };
    const body = yield* HttpClientResponse.schemaBodyJson(TreeResponse)(response);
    return {
      folders: new Map([
        ["", body.sha],
        ...body.tree.flatMap((e) => (e.type === "tree" ? [[e.path, e.sha] as const] : [])),
      ]),
    };
  },
  Effect.timeout("15 seconds"),
  Effect.orElseSucceed(() => ({ error: "could not reach GitHub" })),
  Effect.provide(FetchHttpClient.layer),
);

// Before the CLI replaces a folder it would delete: edits, or a skill another
// installer put there. Skipping is the default: it changes nothing.
const skillQuestion = (subject: string, found: string | undefined, problem: string): Question => ({
  kind: "skill",
  subject,
  found: found ?? "a folder",
  problem,
  choices: [
    { value: "overwrite", title: "overwrite it with a fresh install" },
    { value: "skip", title: "skip on these Machines (leave as is, shown as skipped)" },
  ],
  default: "skip",
});

const decideSkill = (
  item: SkillItem,
  observed: SkillsObserved,
  resolved: SkillsResolved,
  ctx: Context,
): Decision<SkillChange> => {
  const installed = observed.skills.get(item.name);
  const lock = installed?.lock;
  const atHash = lock?.hash ?? installed?.hash;
  const at = atHash === undefined ? {} : { at: short(atHash) };
  const change = { item };
  if (!observed.cli)
    return vpInstallsCli(ctx)
      ? {
          kind: "skip",
          item: item.name,
          reason: "waits for the skills CLI this Ship installs; ship again",
        }
      : { kind: "fail", item: item.name, reason: NO_CLI };
  if (observed.error !== undefined)
    return { kind: "fail", item: item.name, ...at, reason: observed.error };

  const github = githubSource(item);
  const want = item.ref ?? github?.ref ?? "latest";
  if (installed?.path === undefined)
    return { kind: "change", item: item.name, to: isPin(want) ? short(want) : want, change };

  const subject = address("skills", item.name);
  const edited =
    lock === undefined
      ? "was not installed by the skills CLI"
      : lock.sourceType === "github" &&
          lock.hash !== undefined &&
          installed.hash !== undefined &&
          installed.hash !== lock.hash
        ? "was edited there"
        : undefined;
  const folders = github === undefined ? undefined : resolved[repoKey(github.repo, github.ref)];
  const expected =
    folders !== undefined && "folders" in folders && lock?.skillPath !== undefined
      ? folders.folders.get(folderOf(lock.skillPath))
      : undefined;
  const to = expected === undefined ? want : short(expected);
  const from = lock?.hash === undefined ? {} : { from: short(lock.hash) };
  const update = (reason: string): Decision<SkillChange> => ({
    kind: "change",
    item: item.name,
    ...from,
    to,
    reason,
    change,
  });

  if (edited !== undefined) {
    const answer = ctx.answer("skill", subject);
    if (answer === "overwrite") return update(edited);
    if (answer === "skip") return { kind: "skip", item: item.name, ...at, reason: edited };
    return {
      kind: "ask",
      item: item.name,
      ...at,
      question: skillQuestion(subject, atHash === undefined ? undefined : short(atHash), edited),
    };
  }
  if (ctx.rebuild(subject)) return update("--rebuild");
  if (lock !== undefined && github !== undefined) {
    if (lock.sourceType !== "github" || lock.source.toLowerCase() !== github.repo.toLowerCase())
      return update(`installed from ${lock.source}`);
    if (lock.ref !== github.ref) return update(`installed at ${lock.ref ?? "the default branch"}`);
  }
  // An agent dropped from the config keeps the skill: nothing is uninstalled.
  const recorded = observed.records.get(item.name);
  if (recorded === undefined) return update("not installed by a Ship");
  const missing = item.agents.filter((agent) => !recorded.includes(agent));
  if (missing.length > 0) return update(`not installed for ${missing.join(", ")}`);
  if (folders !== undefined && "error" in folders)
    return {
      kind: "skip",
      item: item.name,
      ...at,
      reason: `could not check ${github?.repo ?? item.source}: ${folders.error}`,
    };
  if (folders !== undefined && expected === undefined)
    return update(`not found at ${github?.ref ?? "the default branch"}`);
  if (expected !== undefined && expected !== lock?.hash) return update("its source moved");
  return { kind: "leave", item: item.name, ...at };
};

// One `skills add` per source and agents, so a repo is cloned once for all
// its skills. Its --json result says, skill by skill, what it installed
// (without --json it can exit 0 after a partial failure), and REPORT turns
// that into each skill's hash and Install Record. The Step fails if the CLI
// or any skill did.
const installStep = (batch: ReadonlyArray<SkillItem>): Step => {
  const [first] = batch;
  const names = batch.map((item) => item.name);
  const agents = first?.agents ?? [];
  return {
    id: `skills:${first?.name ?? ""}:install`,
    items: names,
    doing: "installing",
    run: [
      `ff_o=$(ff_skills add ${quote(first === undefined ? "" : installSource(first))} -g -y --json -s ${names.map(quote).join(" ")} -a ${agents.map(quote).join(" ")})`,
      "ff_rc=$?",
      `printf '%s' "$ff_o" | node -e ${quote(REPORT)} ${quote(JSON.stringify([names, agents]))} ${recordDir("skills")}`,
      `ff_rr=$?`,
      `if [ "$ff_rc" -eq 0 ]; then ff_rc=$ff_rr; fi`,
      `(exit "$ff_rc")`,
    ],
  };
};

export const skills: Provider<"skills", SkillItem, SkillsObserved, SkillsResolved, SkillChange> = {
  name: "skills",
  // The CLI's lock, with fleetfizz's record of agents, so --rebuild applies.
  rule: "record",
  // The skills CLI is a vp Global, and runs on vp's Node.
  dependsOn: ["vp"],
  items: (section, listed) =>
    section === undefined
      ? []
      : listed.map(({ name, def }) => ({
          name,
          source: def.source,
          ...(def.ref === undefined ? {} : { ref: def.ref }),
          agents: def.agents ?? section.agents,
        })),
  observe: (items) => {
    if (items.length === 0) return "";
    const args = JSON.stringify([
      items.map((item) => item.name),
      [...new Set(items.flatMap((item) => item.agents))],
    ]);
    return [
      "if command -v skills >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then",
      `  ff_state '{"provider":"skills","fact":"cli","present":true}'`,
      `  DISABLE_TELEMETRY=1 node -e ${quote(OBSERVE)} ${quote(args)}`,
      "else",
      `  ff_state '{"provider":"skills","fact":"cli","present":false}'`,
      "fi",
    ].join("\n");
  },
  parse(facts, records) {
    let cli = false;
    let error: string | undefined;
    const installed = new Map<string, Installed>();
    for (const raw of facts) {
      const fact = decodeFact(raw);
      if (fact._tag === "None") continue;
      const f = fact.value;
      switch (f.fact) {
        case "cli":
          cli = f.present;
          break;
        case "error":
          error = f.error;
          break;
        case "skill": {
          const { fact: _, name, ...rest } = f;
          installed.set(name, rest);
          break;
        }
      }
    }
    const agents = new Map<string, ReadonlyArray<string>>();
    for (const [name, raw] of Object.entries(records)) {
      const record = decodeRecord(raw);
      if (record._tag === "Some") agents.set(name, record.value.agents);
    }
    return { cli, ...(error === undefined ? {} : { error }), skills: installed, records: agents };
  },
  resolve: (items, { token }) =>
    Effect.forEach(
      [
        ...new Map(
          items.flatMap((item) => {
            const github = githubSource(item);
            return github === undefined ? [] : [[repoKey(github.repo, github.ref), github]];
          }),
        ),
      ],
      ([key, { repo, ref }]) =>
        fetchFolders(repo, ref, token).pipe(Effect.map((result) => [key, result] as const)),
      { concurrency: 8 },
    ).pipe(Effect.map((entries): SkillsResolved => Object.fromEntries(entries))),
  decide: ({ items, observed, resolved, ctx }) =>
    items.map((item) => decideSkill(item, observed, resolved, ctx)),
  act: (decisions) => {
    const batches = Map.groupBy(
      decisions.flatMap((d) => (d.kind === "change" ? [d.change.item] : [])),
      (item) => JSON.stringify([installSource(item), item.agents]),
    );
    return [...batches.values()].map(installStep);
  },
};
