import type { Platform } from "@fleetfizz/config";

export interface Targeting {
  readonly platforms?: ReadonlyArray<Platform>;
  readonly machines?: ReadonlyArray<string>;
}

export interface MachineIdentity {
  readonly name: string;
  readonly platform: Platform;
}

// Fields combine with AND; an unset field means every Platform or Machine.
export const targets = (targeting: Targeting, machine: MachineIdentity): boolean =>
  (targeting.platforms?.includes(machine.platform) ?? true) &&
  (targeting.machines?.includes(machine.name) ?? true);

// Array.isArray does not narrow a ReadonlyArray out of a union.
const isVariantList = <D>(entry: D | ReadonlyArray<D>): entry is ReadonlyArray<D> =>
  Array.isArray(entry);

// What a Machine gets from an entry written as one definition or a list of
// Variants (ADR 0014): the first that targets it, with its index when the
// entry is a list. Undefined when none does.
export const variantFor = <D extends Targeting>(
  entry: D | ReadonlyArray<D>,
  machine: MachineIdentity,
): { readonly variant: D; readonly index?: number } | undefined => {
  if (!isVariantList(entry)) return targets(entry, machine) ? { variant: entry } : undefined;
  const index = entry.findIndex((variant) => targets(variant, machine));
  const variant = entry[index];
  return variant === undefined ? undefined : { variant, index };
};
