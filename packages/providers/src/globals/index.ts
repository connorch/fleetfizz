// The package-manager Providers: vp, npm, bun, and pnpm, one per section,
// each keeping the Globals it installs inside their Ranges (ADR 0020). They
// differ only in how they list and install Globals; Node and the package
// managers themselves are the user's, so no Provider keeps their versions.
import * as Schema from "effect/Schema";

import { type FleetConfig, PACKAGE_MANAGERS, type PackageManager } from "@fleetfizz/config";
import {
  decideRangeItem,
  targets,
  variantFor,
  type Context,
  type Decision,
  type MachineIdentity,
  type Named,
  type Provider,
} from "@fleetfizz/core";
import { quote, resolveVersions } from "@fleetfizz/remote";

// How one package manager lists and installs its Globals. `list` prints
// them in its own format, which `parse` reads into versions by package.
interface Manager {
  readonly list: string;
  readonly parse: (output: string) => ReadonlyMap<string, string>;
  readonly install: string;
}

const Dependencies = Schema.Record(Schema.String, Schema.Struct({ version: Schema.String }));
const versionsOf = (deps: typeof Dependencies.Type): ReadonlyMap<string, string> =>
  new Map(Object.entries(deps).map(([name, dep]) => [name, dep.version]));

const decodeVp = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Array(Schema.Struct({ name: Schema.String, version: Schema.String })),
  ),
);
const decodeNpm = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ dependencies: Schema.optionalKey(Dependencies) })),
);
const decodePnpm = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Array(Schema.Struct({ dependencies: Schema.optionalKey(Dependencies) })),
  ),
);

// bun has no JSON listing; `bun pm ls -g` prints a tree of `name@version`.
const parseBun = (output: string): ReadonlyMap<string, string> =>
  new Map(
    output.split("\n").flatMap((line) => {
      const match = /[├└]── (.+)@([^@\s]+)\s*$/.exec(line);
      return match?.[1] === undefined || match[2] === undefined ? [] : [[match[1], match[2]]];
    }),
  );

export const MANAGERS: Readonly<Record<PackageManager, Manager>> = {
  vp: {
    list: "vp list --global --json",
    parse: (output) => {
      const list = decodeVp(output);
      return list._tag === "None" ? new Map() : new Map(list.value.map((g) => [g.name, g.version]));
    },
    install: "vp install -g",
  },
  npm: {
    list: "npm ls -g --depth=0 --json",
    parse: (output) => {
      const list = decodeNpm(output);
      return list._tag === "None" ? new Map() : versionsOf(list.value.dependencies ?? {});
    },
    install: "npm install -g",
  },
  bun: { list: "bun pm ls -g", parse: parseBun, install: "bun add -g" },
  pnpm: {
    list: "pnpm ls -g --depth=0 --json",
    parse: (output) => {
      const list = decodePnpm(output);
      return list._tag === "None"
        ? new Map()
        : versionsOf(Object.assign({}, ...list.value.map((l) => l.dependencies ?? {})));
    },
    install: "pnpm add -g",
  },
};

// The shell test that `pm` is on this Machine: it runs, not only that it is on
// PATH, since a mise shim is there for a tool that is not installed (and
// fails to run under a Check's CHECK_ENV). `pm` is a name or
// a shell word such as "$ff_pm".
export const runs = (pm: string): string => `command ${pm} --version >/dev/null 2>&1`;

// The shell that installs `specs` (`name@version`) with `pm`.
export const installWith = (pm: PackageManager, specs: ReadonlyArray<string>): string =>
  `( command ${MANAGERS[pm].install} ${specs.map(quote).join(" ")} )`;

// The package manager whose section installs `pkg` on this Machine in this
// Ship, if any: the section and the Global both target it. Whatever needs
// `pkg` waits for the next Ship, whose Check can see it. A package manager
// never counts for its own package: `pnpm` in `pnpm.items` keeps pnpm
// updated where it is, and cannot install it where it is not.
export const installedHere = (
  config: FleetConfig,
  machine: MachineIdentity,
  pkg: string,
): PackageManager | undefined =>
  PACKAGE_MANAGERS.find((pm) => {
    if (pm === pkg) return false;
    const section = config[pm];
    const global = section?.items?.[pkg];
    return (
      section !== undefined &&
      global !== undefined &&
      targets(section, machine) &&
      variantFor(global, machine) !== undefined
    );
  });

// Whether a Formula is one that gives `pm` on PATH: Node's (with npm), pnpm,
// or bun. `node@<n>` is keg-only, so its npm is not on PATH.
const givesManager = (pm: PackageManager, formula: string): boolean =>
  pm === "npm"
    ? formula === "node"
    : pm === "vp"
      ? false
      : formula === pm || formula.endsWith(`/${pm}`);

// What installs `pm` on this Machine in this Ship, if anything: another
// package manager's section (installedHere), or a Formula (`brew`), which
// runs before every package manager.
export const managerArrives = (
  config: FleetConfig,
  machine: MachineIdentity,
  pm: PackageManager,
): string | undefined => {
  const by = installedHere(config, machine, pm);
  if (by !== undefined) return by;
  const brew = config.brew;
  if (brew === undefined || !targets(brew, machine)) return undefined;
  return Object.entries(brew.items ?? {}).some(
    ([formula, def]) => givesManager(pm, formula) && variantFor(def, machine) !== undefined,
  )
    ? "brew"
    : undefined;
};

// A Global: its package and Range, and where a "bump" answer edits the config.
export interface GlobalItem extends Named {
  readonly range: string;
  readonly bumpPath: ReadonlyArray<string | number>;
}

// What the Check saw: undefined when the package manager is not on the
// Machine; otherwise its Globals' versions by package.
export type GlobalsObserved = ReadonlyMap<string, string> | undefined;

// Published versions per package.
type GlobalsResolved = Readonly<Record<string, ReadonlyArray<string>>>;

// A Global to install, at this version.
export interface GlobalChange {
  readonly name: string;
  readonly version: string;
}

const GlobalsFact = Schema.Union([
  Schema.Struct({ fact: Schema.Literal("missing") }),
  Schema.Struct({ fact: Schema.Literal("list"), base64: Schema.String }),
]);
const decodeFact = Schema.decodeUnknownOption(GlobalsFact);

const decodeBase64 = (text: string): string =>
  new TextDecoder().decode(Uint8Array.from(atob(text), (c) => c.charCodeAt(0)));

// The Provider for one package manager's section.
const globals = (
  name: PackageManager,
): Provider<PackageManager, GlobalItem, GlobalsObserved, GlobalsResolved, GlobalChange> => {
  const manager = MANAGERS[name];
  // An Item's Decision when the package manager is not on the Machine.
  const missing = (item: GlobalItem, ctx: Context): Decision<GlobalChange> => {
    const by = managerArrives(ctx.config, ctx.machine, name);
    return by === undefined
      ? { kind: "fail", item: item.name, reason: `${name} is not installed` }
      : {
          kind: "skip",
          item: item.name,
          reason: `waits for ${name}, which ${by} installs in this Ship; ship again`,
        };
  };
  return {
    name,
    rule: "range",
    dependsOn: [],
    items: (_section, listed) =>
      listed.map(({ name: pkg, def, path }) => ({
        name: pkg,
        range: def.range,
        bumpPath: [...path, "range"],
      })),
    // Prints the list base64 on one line, whatever its format.
    observe: (items) =>
      items.length === 0
        ? ""
        : [
            `if ${runs(name)}; then`,
            `  ff_l=$(command ${manager.list} 2>/dev/null | base64 | tr -d '\\n')`,
            `  ff_state "{\\"provider\\":\\"${name}\\",\\"fact\\":\\"list\\",\\"base64\\":\\"$ff_l\\"}"`,
            "else",
            `  ff_state '{"provider":"${name}","fact":"missing"}'`,
            "fi",
          ].join("\n"),
    parse(facts) {
      let observed: GlobalsObserved;
      for (const raw of facts) {
        const fact = decodeFact(raw);
        if (fact._tag === "None") continue;
        observed =
          fact.value.fact === "list" ? manager.parse(decodeBase64(fact.value.base64)) : undefined;
      }
      return observed;
    },
    resolve: (items) => resolveVersions(items.map((item) => item.name)),
    decide: ({ items, observed, resolved, ctx }) =>
      items.map((item): Decision<GlobalChange> => {
        if (observed === undefined) return missing(item, ctx);
        const decision = decideRangeItem({
          provider: name,
          item: item.name,
          range: item.range,
          installed: observed.get(item.name),
          available: resolved[item.name] ?? [],
          bumpPath: item.bumpPath,
          ctx,
        });
        return decision.kind === "change"
          ? { ...decision, change: { name: item.name, version: decision.change } }
          : decision;
      }),
    // One install for every Global that changes.
    act(decisions) {
      const changes = decisions.flatMap((d) => (d.kind === "change" ? [d.change] : []));
      return changes.length === 0
        ? []
        : [
            {
              id: `${name}:globals:install`,
              items: changes.map((c) => c.name),
              doing: "installing",
              run: [
                installWith(
                  name,
                  changes.map((c) => `${c.name}@${c.version}`),
                ),
              ],
            },
          ];
    },
  };
};

export const vp = globals("vp");
export const npm = globals("npm");
export const bun = globals("bun");
export const pnpm = globals("pnpm");
