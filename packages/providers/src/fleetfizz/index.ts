// The fleetfizz Provider: fleetfizz itself, the implicit `fleetfizz:fleetfizz`
// Item on every Machine, kept at the config's `version` (ADR 0019). It runs
// last, after every package manager a Ship installs, and with whichever
// package manager installed fizz there; a Machine without fizz gets it from
// the one that installed the Starting Machine's.
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { PACKAGE_MANAGERS, SELF_PACKAGE, type PackageManager } from "@fleetfizz/config";
import { assembleState, type Decision, type Named, type Provider } from "@fleetfizz/core";
import { checkScript, parseLine, runScript } from "@fleetfizz/remote";

import { installWith, managerArrives, runs } from "../globals/index.ts";

// Which package manager installed a fizz, from the paths of its bin and the
// files behind it: vp's shims and packages (in its home or the legacy
// ~/.vite-plus), pnpm's home and its `.pnpm`
// store, bun's home and its `install/global`, then npm's lib/node_modules
// (which vp's own Node also has, so vp is checked first). The store paths
// hold under a custom PNPM_HOME or BUN_INSTALL. Undefined for anything else,
// such as a link to a checkout.
export const installerOf = (paths: ReadonlyArray<string>): PackageManager | undefined => {
  const has = (...parts: ReadonlyArray<string>) =>
    paths.some((path) => parts.some((part) => path.includes(part)));
  if (has("/vite-plus/packages/", "/vite-plus/bin/", "/.vite-plus/packages/", "/.vite-plus/bin/"))
    return "vp";
  if (has("/pnpm/", "/.pnpm/")) return "pnpm";
  if (has("/.bun/", "/install/global/node_modules/")) return "bun";
  if (has("/lib/node_modules/")) return "npm";
  return undefined;
};

// What one Machine has: its fizz, if any, and the package managers that run there.
export interface FleetfizzObserved {
  readonly fizz?: { readonly path: string; readonly real: string; readonly version: string };
  readonly managers: ReadonlySet<string>;
}

// The Starting Machine, and the package manager that installed its fizz,
// read there as its Check would: after fizz checks its version (ADR 0019),
// the fizz on its PATH is the one running. Undefined when no package manager
// fleetfizz knows installed it.
export interface FleetfizzResolved {
  readonly from: string;
  readonly installer: PackageManager | undefined;
}

export interface FleetfizzChange {
  readonly version: string;
  readonly with: PackageManager;
}

const FleetfizzFact = Schema.Union([
  Schema.Struct({
    fact: Schema.Literal("fizz"),
    path: Schema.String,
    real: Schema.String,
    version: Schema.String,
  }),
  Schema.Struct({ fact: Schema.Literal("manager"), name: Schema.String }),
]);
const decodeFact = Schema.decodeUnknownOption(FleetfizzFact);

const OBSERVE = [
  "if command -v fizz >/dev/null 2>&1; then",
  "  ff_b=$(command -v fizz)",
  // mise and Volta shims run their tool's own bin, which `which` names.
  `  case "$ff_b" in */mise/shims/*) ff_b=$(mise which fizz 2>/dev/null || printf '%s' "$ff_b") ;; */.volta/bin/*) ff_b=$(volta which fizz 2>/dev/null || printf '%s' "$ff_b") ;; esac`,
  // macOS before 13 has neither realpath nor readlink -f.
  `  ff_rp=$(realpath "$ff_b" 2>/dev/null || readlink -f "$ff_b" 2>/dev/null || printf '%s' "$ff_b")`,
  `  ff_v=$(command fizz --version 2>/dev/null | sed -n 's/^fizz v\\{0,1\\}\\([^ ]*\\).*/\\1/p' | head -n 1)`,
  `  ff_state "{\\"provider\\":\\"fleetfizz\\",\\"fact\\":\\"fizz\\",\\"path\\":\\"$(ff_json "$ff_b")\\",\\"real\\":\\"$(ff_json "$ff_rp")\\",\\"version\\":\\"$(ff_json "$ff_v")\\"}"`,
  "fi",
  `for ff_pm in ${PACKAGE_MANAGERS.join(" ")}; do`,
  `  if ${runs('"$ff_pm"')}; then ff_state "{\\"provider\\":\\"fleetfizz\\",\\"fact\\":\\"manager\\",\\"name\\":\\"$ff_pm\\"}"; fi`,
  "done",
].join("\n");

const ITEM = SELF_PACKAGE;

const parse = (facts: ReadonlyArray<unknown>): FleetfizzObserved => {
  let fizz: FleetfizzObserved["fizz"];
  const managers = new Set<string>();
  for (const raw of facts) {
    const fact = decodeFact(raw);
    if (fact._tag === "None") continue;
    if (fact.value.fact === "fizz") fizz = fact.value;
    else managers.add(fact.value.name);
  }
  return { ...(fizz === undefined ? {} : { fizz }), managers };
};

export const fleetfizz: Provider<
  "fleetfizz",
  Named,
  FleetfizzObserved,
  FleetfizzResolved,
  FleetfizzChange
> = {
  name: "fleetfizz",
  rule: "range",
  dependsOn: [],
  items: () => [{ name: ITEM }],
  observe: () => OBSERVE,
  parse,
  // Reads the Starting Machine's fizz here, as its Check would, so a Ship
  // with --only another Machine still knows what to install fizz with.
  resolve: (items, { starting }) =>
    Effect.gen(function* () {
      const facts: unknown[] = [];
      yield* runScript(
        { name: starting.machine.name, local: true },
        checkScript({ scope: starting, providers: [{ provider: fleetfizz, items }] }),
        [],
        (line) =>
          Effect.sync(() => {
            const parsed = parseLine(line);
            if (parsed.kind === "state") facts.push(parsed.fact);
          }),
      );
      const { fizz } = parse(assembleState(facts).facts.fleetfizz ?? []);
      return {
        from: starting.machine.name,
        installer: fizz === undefined ? undefined : installerOf([fizz.path, fizz.real]),
      };
    }).pipe(Effect.orElseSucceed(() => ({ from: starting.machine.name, installer: undefined }))),
  decide({ observed, resolved, ctx }): ReadonlyArray<Decision<FleetfizzChange>> {
    const version = ctx.config.version;
    const { fizz } = observed;
    // The Starting Machine already runs `version`: fizz checks before it
    // does anything (ADR 0019).
    if (ctx.machine.name === resolved.from || fizz?.version === version)
      return [{ kind: "leave", item: ITEM, at: version }];
    const at = fizz === undefined || fizz.version === "" ? {} : { at: fizz.version };
    // On PATH here, or installed by a section in this Ship, before this Step.
    const usable = (pm: PackageManager) =>
      observed.managers.has(pm) || managerArrives(ctx.config, ctx.machine, pm) !== undefined;
    if (fizz !== undefined) {
      const installer = installerOf([fizz.path, fizz.real]);
      if (installer === undefined)
        return [
          {
            kind: "fail",
            item: ITEM,
            ...at,
            reason: `fizz at ${fizz.path} was not installed by ${PACKAGE_MANAGERS.join(", ")}; install ${SELF_PACKAGE}@${version} there`,
          },
        ];
      if (!usable(installer))
        return [
          {
            kind: "fail",
            item: ITEM,
            ...at,
            reason: `${installer} installed fizz here but is not on PATH; install ${SELF_PACKAGE}@${version} there`,
          },
        ];
      return [
        {
          kind: "change",
          item: ITEM,
          ...(at.at === undefined ? {} : { from: at.at }),
          to: version,
          change: { version, with: installer },
        },
      ];
    }
    const installer = resolved.installer;
    if (installer === undefined)
      return [
        {
          kind: "skip",
          item: ITEM,
          reason: `fizz on ${resolved.from} was not installed by ${PACKAGE_MANAGERS.join(", ")}, so there is none to install it with here`,
        },
      ];
    if (!usable(installer)) return [{ kind: "skip", item: ITEM, reason: `no ${installer} here` }];
    return [{ kind: "change", item: ITEM, to: version, change: { version, with: installer } }];
  },
  act: (decisions) =>
    decisions.flatMap((d) =>
      d.kind === "change"
        ? [
            {
              id: `fleetfizz:${ITEM}:install`,
              items: [ITEM],
              doing: "installing",
              run: [installWith(d.change.with, [`${SELF_PACKAGE}@${d.change.version}`])],
            },
          ]
        : [],
    ),
};
