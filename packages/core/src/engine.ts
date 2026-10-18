// The engine: pure. What is the same for every Provider - Targeting on
// sections and Items, picking Variants, dependsOn, and holding back the
// dependents of a failed Item - around each Provider's own decide and act.
import type { FleetConfig, ProviderName } from "@fleetfizz/config";

import type { AnyProvider, Context, Decision, Listed, Named, Step } from "./provider.ts";
import type { MachineState } from "./state.ts";
import { targets, variantFor, type MachineIdentity, type Targeting } from "./targeting.ts";

// A Provider's dependencies: its own, then the config section's.
export const dependenciesOf = (
  provider: AnyProvider,
  config: FleetConfig,
): ReadonlyArray<ProviderName> => [
  ...new Set([...provider.dependsOn, ...(config[provider.name]?.dependsOn ?? [])]),
];

const withoutTargeting = <D extends Targeting>({
  platforms: _platforms,
  machines: _machines,
  ...def
}: D): Omit<D, keyof Targeting> => def;

// The Provider's Items that target the Machine: its implicit Items, and each
// listed Item's Variant for it. A section that does not target the Machine
// leaves only the implicit Items.
export const targetedItems = (
  provider: AnyProvider,
  config: FleetConfig,
  machine: MachineIdentity,
): ReadonlyArray<Named> => {
  const section = config[provider.name];
  if (section === undefined || !targets(section, machine)) return provider.items(undefined, []);
  const listed = Object.entries(section.items ?? {}).flatMap(([name, entry]) => {
    const chosen = variantFor(entry, machine);
    if (chosen === undefined) return [];
    const at = chosen.index === undefined ? [] : [chosen.index];
    return [
      {
        name,
        def: withoutTargeting(chosen.variant),
        path: [provider.name, "items", name, ...at],
      } satisfies Listed<typeof chosen.variant>,
    ];
  });
  return provider.items(section, listed);
};

// Every Machine name a Targeting names anywhere in `value`: a `machines`
// list of names, at any depth.
const machineNames = (value: unknown): ReadonlyArray<string> => {
  if (Array.isArray(value)) return value.flatMap(machineNames);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, v]) =>
    key === "machines" && Array.isArray(v) && v.every((name) => typeof name === "string")
      ? v
      : machineNames(v),
  );
};

// Every Machine name a Provider's section names: on the section, its Items
// and their Variants, and settings such as `repos.cloneRoot`. A typo in the
// config is caught before it silently targets nothing.
export const machinesNamed = (provider: AnyProvider, config: FleetConfig): ReadonlyArray<string> =>
  machineNames(config[provider.name]);

export interface ProviderPlan {
  readonly name: ProviderName;
  readonly rule: AnyProvider["rule"];
  readonly dependsOn: ReadonlyArray<ProviderName>;
  readonly decisions: ReadonlyArray<Decision<unknown, unknown>>;
  readonly steps: ReadonlyArray<Step>;
}

// One Machine's plan: its Providers in run order.
export interface MachinePlan {
  readonly machine: MachineIdentity;
  readonly providers: ReadonlyArray<ProviderPlan>;
}

export interface PlanInput {
  // In run order (orderProviders).
  readonly providers: ReadonlyArray<AnyProvider>;
  readonly state: MachineState;
  // Each Provider's resolve result, keyed by Provider.
  readonly resolved: Readonly<Partial<Record<ProviderName, unknown>>>;
  readonly ctx: Omit<Context, "home">;
}

// Holding back: a Provider whose dependency has a failed Item on this
// Machine (or is held itself) changes nothing there; its changes and
// Questions become skips. A dependency with no Items here holds nothing back.
const hold = (
  decisions: ReadonlyArray<Decision<unknown, unknown>>,
  by: ProviderName,
): ReadonlyArray<Decision<unknown, unknown>> =>
  decisions.map((d) =>
    d.kind === "change" || d.kind === "ask"
      ? {
          kind: "skip",
          item: d.item,
          ...(d.kind === "change" && d.from !== undefined ? { at: d.from } : {}),
          ...(d.kind === "ask" && d.at !== undefined ? { at: d.at } : {}),
          reason: `depends on ${by}`,
        }
      : d,
  );

export const planMachine = (input: PlanInput): MachinePlan => {
  const ctx: Context = { ...input.ctx, home: input.state.home ?? "~" };
  const plans = new Map<ProviderName, ProviderPlan>();
  const held = new Set<ProviderName>();
  for (const provider of input.providers) {
    const dependsOn = dependenciesOf(provider, ctx.config);
    const items = targetedItems(provider, ctx.config, ctx.machine);
    const decisions = provider.decide({
      items,
      observed: provider.parse(
        input.state.facts[provider.name] ?? [],
        input.state.records[provider.name] ?? {},
      ),
      resolved: input.resolved[provider.name],
      ctx,
    });
    const by = dependsOn.find((name) => {
      const dep = plans.get(name);
      return (
        dep !== undefined &&
        dep.decisions.length > 0 &&
        (held.has(name) || dep.decisions.some((d) => d.kind === "fail"))
      );
    });
    if (by !== undefined) held.add(provider.name);
    plans.set(provider.name, {
      name: provider.name,
      rule: provider.rule,
      dependsOn,
      decisions: by === undefined ? decisions : hold(decisions, by),
      steps: by === undefined ? provider.act(decisions, ctx) : [],
    });
  }
  return { machine: ctx.machine, providers: [...plans.values()] };
};
