// The vp Provider: vp itself, the default Node, and Globals, each kept inside
// its Range. Every Machine gets vp (bootstrapped when missing) and the running
// fleetfizz as a Global, whether or not the section targets it (ADR 0008).
import * as Schema from "effect/Schema";
import * as semver from "semver";

import { SELF_PACKAGE } from "@fleetfizz/config";
import {
  decideRangeItem,
  type Context,
  type Decision,
  type Provider,
  type Step,
  type Targeted,
  type Targeting,
} from "@fleetfizz/core";
import { quote, resolveVersions, vpEnv } from "@fleetfizz/remote";

// Registry package names for the toolchain itself.
const VP_PACKAGE = "vite-plus";
const NODE_PACKAGE = "node";

// An Item kept inside a Range (vp, Node, a Global), or fleetfizz itself,
// pinned to the running version.
export type VpItem = Targeted &
  (
    | {
        readonly kind: "vp" | "node" | "global";
        readonly package: string;
        readonly range: string;
        // Where a "bump" answer edits the config.
        readonly bumpPath: ReadonlyArray<string>;
      }
    | { readonly kind: "self" }
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
  Schema.Struct({ fact: Schema.Literal("node"), version: Schema.NullOr(Schema.String) }),
  Schema.Struct({ fact: Schema.Literal("globals"), list: Schema.Array(GlobalEntry) }),
]);
const decodeFact = Schema.decodeUnknownOption(VpFact);

export interface VpObserved {
  // Undefined when vp is not installed; Node and Globals are then unknown too.
  readonly vp?: { readonly version: string; readonly path?: string };
  readonly node?: string;
  readonly globals: ReadonlyMap<string, GlobalEntry>;
}

// Published versions per package.
type VpResolved = Readonly<Record<string, ReadonlyArray<string>>>;

export type VpChange =
  // vp's installer, then the resolved version.
  | { readonly kind: "bootstrap"; readonly version: string }
  | { readonly kind: "upgrade"; readonly version: string }
  | { readonly kind: "node"; readonly version: string }
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
  `  ff_n=$(command vp env default 2>/dev/null | sed -n 's/^Default Node.js version: //p' | head -n 1)`,
  `  if [ -n "$ff_n" ]; then ff_state "{\\"provider\\":\\"vp\\",\\"fact\\":\\"node\\",\\"version\\":\\"$(ff_json "$ff_n")\\"}"; else ff_state '{"provider":"vp","fact":"node","version":null}'; fi`,
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
      : item.kind === "node"
        ? observed.node
        : observed.globals.get(item.name)?.version;
  const decision = decideRangeItem({
    provider: "vp",
    item: item.name,
    range: item.range,
    installed,
    available: resolved[item.package] ?? [],
    bumpPath: item.bumpPath,
    ctx,
  });
  if (decision.kind !== "change") return decision;
  const version = decision.change;
  if (item.kind === "vp" && observed.vp === undefined)
    return { ...decision, change: { kind: "bootstrap", version } };
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
      : item.kind === "node"
        ? { kind: "node", version }
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
        package: name,
        range: typeof global === "string" ? global : global.range,
        bumpPath:
          typeof global === "string" ? ["vp", "globals", name] : ["vp", "globals", name, "range"],
      };
    });
    return [
      {
        name: "vp",
        kind: "vp",
        package: VP_PACKAGE,
        range: section?.version ?? "*",
        bumpPath: ["vp", "version"],
      },
      ...(section?.node === undefined
        ? []
        : [
            {
              name: "node",
              kind: "node",
              package: NODE_PACKAGE,
              range: section.node,
              bumpPath: ["vp", "node"],
            } as const,
          ]),
      ...globals,
      { name: SELF_PACKAGE, kind: "self" },
    ];
  },
  observe: () => OBSERVE,
  parse(facts) {
    let vpFact: VpObserved["vp"];
    let node: string | undefined;
    let globals: ReadonlyArray<GlobalEntry> = [];
    for (const raw of facts) {
      const fact = decodeFact(raw);
      if (fact._tag === "None") continue;
      const f = fact.value;
      if (f.fact === "vp" && f.version !== null)
        vpFact = { version: f.version, ...(f.path === undefined ? {} : { path: f.path }) };
      else if (f.fact === "node" && f.version !== null) node = f.version;
      else if (f.fact === "globals") globals = f.list;
    }
    // Without vp, Node and Globals cannot be read or changed.
    if (vpFact === undefined) return { globals: new Map() };
    return {
      vp: vpFact,
      ...(node === undefined ? {} : { node }),
      globals: new Map(globals.map((g) => [g.name, g])),
    };
  },
  resolve: (items) =>
    resolveVersions(items.flatMap((item) => (item.kind === "self" ? [] : [item.package]))),
  decide({ items, observed, resolved, ctx }) {
    const decisions = items.map((item) =>
      item.kind === "self"
        ? decideSelf(item.name, observed.globals.get(item.name)?.version, ctx.self)
        : decideRanged(item, observed, resolved, ctx),
    );
    // A Global left as is but installed on another Node than the default is
    // reinstalled at its version, so it runs on the default Node.
    const nodeChange = decisions.find((d) => d.kind === "change" && d.change.kind === "node");
    const nodeDefault = nodeChange?.kind === "change" ? nodeChange.to : observed.node;
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
        reason: `installed on Node ${node}`,
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
            run: [`${VP_INSTALL} && command vp upgrade ${quote(change.version)}`],
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
        case "node":
          steps.push({
            id: "vp:node:default",
            items: ["node"],
            doing: "installing",
            run: [`( command vp env default ${quote(change.version)} )`],
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
