// The engine: pure. What is the same for every Provider - Targeting on
// sections and Items, dependsOn, and holding back the dependents of a failed
// Item - around each Provider's own decide and act.
import type { FleetConfig, ProviderName } from "@fleetfizz/config";

import type { AnyProvider, Context, Decision, Step, Targeted } from "./provider.ts";
import type { MachineState } from "./state.ts";
import { targets, type MachineIdentity, type Targeting } from "./targeting.ts";

type Section = NonNullable<FleetConfig[ProviderName]>;
// A section that is an object (vp), not a list (repos), carries its own
// Targeting and dependsOn.
type ObjectSection = Exclude<Section, ReadonlyArray<unknown>>;
const isObjectSection = (section: Section): section is ObjectSection => !Array.isArray(section);

const sectionTargeting = (section: Section): Targeting => (isObjectSection(section) ? section : {});

// A Provider's dependencies: its own, then the config section's.
export const dependenciesOf = (
  provider: AnyProvider,
  config: FleetConfig,
): ReadonlyArray<ProviderName> => {
  const section = config[provider.name];
  const extra = section !== undefined && isObjectSection(section) ? (section.dependsOn ?? []) : [];
  return [...new Set([...provider.dependsOn, ...extra])];
};

// The Provider's Items that target the Machine. A section that does not
// target it leaves only the Provider's implicit Items.
export const targetedItems = (
  provider: AnyProvider,
  config: FleetConfig,
  machine: MachineIdentity,
): ReadonlyArray<Targeted> => {
  const section = config[provider.name];
  const scoped =
    section !== undefined && targets(sectionTargeting(section), machine) ? section : undefined;
  return provider.items(scoped).filter((item) => targets(item, machine));
};

// Every Machine name a Provider's section and Items target, so a typo in the
// config is caught before it silently targets nothing.
export const machinesNamed = (
  provider: AnyProvider,
  config: FleetConfig,
): ReadonlyArray<string> => {
  const section = config[provider.name];
  return [
    ...(section === undefined ? [] : (sectionTargeting(section).machines ?? [])),
    ...provider.items(section).flatMap((item) => item.machines ?? []),
  ];
};

export interface ProviderPlan {
  readonly name: ProviderName;
  readonly rule: AnyProvider["rule"];
  readonly dependsOn: ReadonlyArray<ProviderName>;
  readonly decisions: ReadonlyArray<Decision<unknown>>;
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
  decisions: ReadonlyArray<Decision<unknown>>,
  by: ProviderName,
): ReadonlyArray<Decision<unknown>> =>
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
