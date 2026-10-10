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
