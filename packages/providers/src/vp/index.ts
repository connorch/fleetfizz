// The vp Provider: vp itself, the default Node and package managers, and
// Globals, each kept inside its Range. Every Machine gets vp (bootstrapped
// when missing) in managed mode (ADR 0011) and the running fleetfizz as a
// Global, whether or not the section targets it (ADR 0008).
import * as Schema from "effect/Schema";
import * as semver from "semver";

import { PACKAGE_MANAGERS, SELF_PACKAGE, type PackageManager } from "@fleetfizz/config";
import {
  address,
  decideRangeItem,
  type Context,
  type Decision,
  type Provider,
  type Step,
  type Targeted,
  type Targeting,
} from "@fleetfizz/core";
import { quote, resolveVersions, vpEnv } from "@fleetfizz/remote";

// Registry package names for vp itself.
const VP_PACKAGE = "vite-plus";

// The tools vp keeps a default version of, by Item name, and the registry
// packages their versions come from. Yarn 2 and newer is published as
// @yarnpkg/cli-dist.
type Tool = "node" | PackageManager;
const TOOL_PACKAGES: Readonly<Record<Tool, ReadonlyArray<string>>> = {
  node: ["node"],
  npm: ["npm"],
  pnpm: ["pnpm"],
  yarn: ["yarn", "@yarnpkg/cli-dist"],
  bun: ["bun"],
};

// An Item kept inside a Range (vp, a default tool, a Global), vp's managed
// mode, or fleetfizz itself, pinned to the running version.
export type VpItem = Targeted &
  (
    | {
        readonly kind: "vp" | "global";
        readonly packages: ReadonlyArray<string>;
        readonly range: string;
        // Where a "bump" answer edits the config.
        readonly bumpPath: ReadonlyArray<string>;
      }
    | {
        readonly kind: "default";
        readonly name: Tool;
        readonly packages: ReadonlyArray<string>;
        readonly range: string;
        readonly bumpPath: ReadonlyArray<string>;
      }
    | { readonly kind: "mode" | "self" }
  );

const GlobalEntry = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  platform: Schema.optionalKey(Schema.Struct({ node: Schema.optionalKey(Schema.String) })),
});
type GlobalEntry = typeof GlobalEntry.Type;

const VpFact = Schema.Union([
  // Where vp is matters: `vp upgrade` cannot upgrade a Homebrew install.
  Schema.Struct({
    fact: Schema.Literal("vp"),
    version: Schema.NullOr(Schema.String),
    path: Schema.optionalKey(Schema.String),
  }),
  // A tool's default version, one fact per tool vp reports.
  Schema.Struct({ fact: Schema.Literal("default"), tool: Schema.String, version: Schema.String }),
  Schema.Struct({
    fact: Schema.Literal("mode"),
    mode: Schema.Literals(["managed", "system-first"]),
  }),
  Schema.Struct({ fact: Schema.Literal("globals"), list: Schema.Array(GlobalEntry) }),
]);
const decodeFact = Schema.decodeUnknownOption(VpFact);

export interface VpObserved {
  // Undefined when vp is not installed; everything else is then unknown too.
  readonly vp?: { readonly version: string; readonly path?: string };
  // "system-first" when any tool's shim prefers the system install.
  readonly mode?: "managed" | "system-first";
  // Default versions by tool.
  readonly defaults: ReadonlyMap<string, string>;
  readonly globals: ReadonlyMap<string, GlobalEntry>;
}

// Published versions per package.
type VpResolved = Readonly<Record<string, ReadonlyArray<string>>>;

export type VpChange =
  // vp's installer, then the resolved version, if there is one.
  | { readonly kind: "bootstrap"; readonly version?: string }
  | { readonly kind: "upgrade"; readonly version: string }
  | { readonly kind: "mode" }
  | { readonly kind: "default"; readonly tool: Tool; readonly version: string }
  | { readonly kind: "global"; readonly name: string; readonly version: string }
  // A Global installed on another Node than the default, reinstalled as is.
  | { readonly kind: "reinstall"; readonly name: string; readonly version: string };

// vp's installer, then its env file again so `vp` resolves for the rest of
// the script.
const VP_INSTALL = [
  "curl -fsSL https://vite.plus | bash",
  ...vpEnv.split("\n"),
  // Braced so its `|| true` cannot swallow a failed installer earlier in the chain.
  "{ hash -r 2>/dev/null || true; }",
].join(" && ");

const isHomebrew = (path: string | undefined) =>
  path !== undefined && (path.includes("/homebrew/") || path.includes("/Cellar/"));

const OBSERVE = [
  "if command -v vp >/dev/null 2>&1; then",
  `  ff_v=$(command vp --version 2>/dev/null | sed -n 's/^vp v\\{0,1\\}\\([^ ]*\\).*/\\1/p' | head -n 1)`,
  `  ff_state "{\\"provider\\":\\"vp\\",\\"fact\\":\\"vp\\",\\"version\\":\\"$(ff_json "$ff_v")\\",\\"path\\":\\"$(ff_json "$(command -v vp)")\\"}"`,
  // doctor prints each shim's mode and changes nothing.
  "  if command vp env doctor 2>/dev/null | grep -q 'system-first mode'; then ff_m=system-first; else ff_m=managed; fi",
  `  ff_state "{\\"provider\\":\\"vp\\",\\"fact\\":\\"mode\\",\\"mode\\":\\"$ff_m\\"}"`,
  `  command vp env default 2>/dev/null | sed -n -e 's/^Default Node.js version: /node /p' -e 's/^Default \\([a-z]*\\) version: /\\1 /p' | while read -r ff_t ff_n; do`,
  `    ff_state "{\\"provider\\":\\"vp\\",\\"fact\\":\\"default\\",\\"tool\\":\\"$(ff_json "$ff_t")\\",\\"version\\":\\"$(ff_json "$ff_n")\\"}"`,
  "  done",
  `  ff_g=$(command vp list --global --json 2>/dev/null | tr -d '\\n')`,
  `  ff_state "{\\"provider\\":\\"vp\\",\\"fact\\":\\"globals\\",\\"list\\":\${ff_g:-[]}}"`,
  "else",
  `  ff_state '{"provider":"vp","fact":"vp","version":null}'`,
  "fi",
].join("\n");

// fleetfizz is pinned to the running version. A Machine running a newer one
// is not downgraded: someone shipped from there, so this Machine is behind.
const decideSelf = (
  item: string,
  installed: string | undefined,
  self: string,
): Decision<VpChange> => {
  const at = installed === undefined ? {} : { at: installed };
  if (installed === undefined || semver.lt(installed, self))
    return {
      kind: "change",
      item,
      ...(installed === undefined ? {} : { from: installed }),
      to: self,
      change: { kind: "global", name: item, version: self },
    };
  if (semver.gt(installed, self))
    return {
      kind: "fail",
      item,
      ...at,
      reason: `runs ${SELF_PACKAGE} ${installed}, newer than this ${self}; upgrade here first`,
    };
  return { kind: "leave", item, ...at };
};

const MODE_SUBJECT = address("vp", "mode");
const NOT_MANAGED = "needs managed mode";

// Managed mode is required (ADR 0011): a system-first Machine is asked
// whether to switch, and skipping is the default. A bare Machine's fresh vp
// is switched too, since its mode cannot be read before the install.
const decideMode = (observed: VpObserved, ctx: Context): Decision<VpChange> => {
  if (observed.vp !== undefined && observed.mode !== "system-first")
    return { kind: "leave", item: "mode", at: "managed" };
  const from = observed.mode === undefined ? {} : { from: observed.mode };
  const answer = observed.vp === undefined ? "managed" : ctx.answer("mode", MODE_SUBJECT);
  if (answer === "managed")
    return { kind: "change", item: "mode", ...from, to: "managed", change: { kind: "mode" } };
  if (answer === "skip")
    return { kind: "skip", item: "mode", at: "system-first", reason: NOT_MANAGED };
  return {
    kind: "ask",
    item: "mode",
    at: "system-first",
    question: {
      kind: "mode",
      subject: MODE_SUBJECT,
      found: "system-first",
      problem: NOT_MANAGED,
      choices: [
        { value: "managed", title: "switch to managed mode" },
        { value: "skip", title: "skip Node and package managers on these Machines" },
      ],
      default: "skip",
    },
  };
};

// A Range Item's Decision, with its version as a VpChange.
const decideRanged = (
  item: Extract<VpItem, { readonly range: string }>,
  observed: VpObserved,
  resolved: VpResolved,
  ctx: Context,
): Decision<VpChange> => {
  const installed =
    item.kind === "vp"
      ? observed.vp?.version
      : item.kind === "default"
        ? observed.defaults.get(item.name)
        : observed.globals.get(item.name)?.version;
  const decision = decideRangeItem({
    provider: "vp",
    item: item.name,
    range: item.range,
    installed,
    available: item.packages.flatMap((p) => resolved[p] ?? []),
    bumpPath: item.bumpPath,
    ctx,
  });
  // A bare Machine gets vp's installer, then the resolved version. When the
  // registry cannot be read and any version will do, the installer's newest is enough.
  if (item.kind === "vp" && observed.vp === undefined) {
    if (decision.kind === "change")
      return { ...decision, change: { kind: "bootstrap", version: decision.change } };
    if (decision.kind === "fail" && (item.range === "*" || item.range === "latest"))
      return { kind: "change", item: item.name, to: "latest", change: { kind: "bootstrap" } };
    return decision;
  }
  if (decision.kind !== "change") return decision;
  const version = decision.change;
  if (item.kind === "vp" && isHomebrew(observed.vp?.path))
    return {
      kind: "fail",
      item: item.name,
      ...(installed === undefined ? {} : { at: installed }),
      reason: `vp ${installed} was installed with Homebrew; run brew upgrade vite-plus to get ${version}`,
    };
  const change: VpChange =
    item.kind === "vp"
      ? { kind: "upgrade", version }
      : item.kind === "default"
        ? { kind: "default", tool: item.name, version }
        : { kind: "global", name: item.name, version };
  return { ...decision, change };
};

export const vp: Provider<"vp", VpItem, VpObserved, VpResolved, VpChange> = {
  name: "vp",
  rule: "range",
  dependsOn: [],
  items(section) {
    const globals = Object.entries(section?.globals ?? {}).map(([name, global]): VpItem => {
      const targeting: Targeting = typeof global === "string" ? {} : global;
      return {
        ...(targeting.platforms === undefined ? {} : { platforms: targeting.platforms }),
        ...(targeting.machines === undefined ? {} : { machines: targeting.machines }),
        name,
        kind: "global",
        packages: [name],
        range: typeof global === "string" ? global : global.range,
        bumpPath:
          typeof global === "string" ? ["vp", "globals", name] : ["vp", "globals", name, "range"],
      };
    });
    const defaults = (["node", ...PACKAGE_MANAGERS] as const).flatMap((tool): VpItem[] => {
      const range = section?.[tool];
      return range === undefined
        ? []
        : [
            {
              name: tool,
              kind: "default",
              packages: TOOL_PACKAGES[tool],
              range,
              bumpPath: ["vp", tool],
            },
          ];
    });
    // Mode before the defaults, so its Step runs first.
    return [
      {
        name: "vp",
        kind: "vp",
        packages: [VP_PACKAGE],
        range: section?.version ?? "*",
        bumpPath: ["vp", "version"],
      },
      { name: "mode", kind: "mode" },
      ...defaults,
      ...globals,
      { name: SELF_PACKAGE, kind: "self" },
    ];
  },
  observe: () => OBSERVE,
  parse(facts) {
    let vpFact: VpObserved["vp"];
    let mode: VpObserved["mode"];
    const defaults = new Map<string, string>();
    let globals: ReadonlyArray<GlobalEntry> = [];
    for (const raw of facts) {
      const fact = decodeFact(raw);
      if (fact._tag === "None") continue;
      const f = fact.value;
      if (f.fact === "vp" && f.version !== null)
        vpFact = { version: f.version, ...(f.path === undefined ? {} : { path: f.path }) };
      else if (f.fact === "mode") mode = f.mode;
      else if (f.fact === "default") defaults.set(f.tool, f.version);
      else if (f.fact === "globals") globals = f.list;
    }
    // Without vp, nothing else can be read or changed.
    if (vpFact === undefined) return { defaults: new Map(), globals: new Map() };
    return {
      vp: vpFact,
      ...(mode === undefined ? {} : { mode }),
      defaults,
      globals: new Map(globals.map((g) => [g.name, g])),
    };
  },
  resolve: (items) =>
    resolveVersions(items.flatMap((item) => ("packages" in item ? item.packages : []))),
  decide({ items, observed, resolved, ctx }) {
    const mode = decideMode(observed, ctx);
    // Default versions only take effect in managed mode.
    const managed = mode.kind === "leave" || mode.kind === "change";
    const decisions = items.map((item): Decision<VpChange> => {
      switch (item.kind) {
        case "mode":
          return mode;
        case "self":
          return decideSelf(item.name, observed.globals.get(item.name)?.version, ctx.self);
        case "default":
          if (!managed) {
            const at = observed.defaults.get(item.name);
            return {
              kind: "skip",
              item: item.name,
              ...(at === undefined ? {} : { at }),
              reason: NOT_MANAGED,
            };
          }
          return decideRanged(item, observed, resolved, ctx);
        default:
          return decideRanged(item, observed, resolved, ctx);
      }
    });
    // A Global left as is but installed on another Node than the default is
    // reinstalled at its version, so it runs on the default Node.
    const nodeChange = decisions.find(
      (d) => d.kind === "change" && d.change.kind === "default" && d.change.tool === "node",
    );
    const nodeDefault =
      nodeChange?.kind === "change" ? nodeChange.to : observed.defaults.get("node");
    return decisions.map((d, i) => {
      const item = items[i];
      const current = observed.globals.get(d.item);
      const node = current?.platform?.node;
      if (
        d.kind !== "leave" ||
        item === undefined ||
        (item.kind !== "global" && item.kind !== "self") ||
        current === undefined ||
        node === undefined ||
        nodeDefault === undefined ||
        node === nodeDefault
      )
        return d;
      return {
        kind: "change",
        item: d.item,
        from: current.version,
        to: current.version,
        reason: `Node ${node} → ${nodeDefault}`,
        change: { kind: "reinstall", name: d.item, version: current.version },
      };
    });
  },
  act(decisions) {
    const changes = decisions.flatMap((d) => (d.kind === "change" ? [d.change] : []));
    const steps: Step[] = [];
    for (const change of changes) {
      switch (change.kind) {
        case "bootstrap":
          // In this shell, not a subshell, so its PATH change reaches later steps.
          steps.push({
            id: "vp:vp:install",
            items: ["vp"],
            doing: "installing",
            run: [
              change.version === undefined
                ? VP_INSTALL
                : `${VP_INSTALL} && command vp upgrade ${quote(change.version)}`,
            ],
          });
          break;
        case "upgrade":
          steps.push({
            id: "vp:vp:upgrade",
            items: ["vp"],
            doing: "upgrading",
            run: [`( command vp upgrade ${quote(change.version)} )`],
          });
          break;
        case "mode":
          steps.push({
            id: "vp:mode:on",
            items: ["mode"],
            doing: "switching",
            run: ["( command vp env on )"],
          });
          break;
        case "default":
          steps.push({
            id: `vp:${change.tool}:default`,
            items: [change.tool],
            doing: "installing",
            run: [
              `( command vp env default ${quote(change.tool === "node" ? change.version : `${change.tool}@${change.version}`)} )`,
            ],
          });
          break;
        case "reinstall":
          steps.push({
            id: `vp:${change.name}:reinstall`,
            items: [change.name],
            doing: "reinstalling",
            run: [`( command vp install -g ${quote(`${change.name}@${change.version}`)} )`],
          });
          break;
        case "global":
          break;
      }
    }
    const installs = changes.flatMap((c) => (c.kind === "global" ? [c] : []));
    if (installs.length > 0)
      steps.push({
        id: "vp:globals:install",
        items: installs.map((c) => c.name),
        doing: "installing",
        run: [
          `( command vp install -g ${installs.map((c) => quote(`${c.name}@${c.version}`)).join(" ")} )`,
        ],
      });
    return steps;
  },
};
