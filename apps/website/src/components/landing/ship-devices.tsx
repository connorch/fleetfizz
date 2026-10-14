import { HardDriveIcon } from "@fleetfizz/ui/components/hard-drive-icon";
import { LaptopIcon } from "@fleetfizz/ui/components/laptop-icon";
import { MonitorIcon } from "@fleetfizz/ui/components/monitor-icon";
import { ServerIcon } from "@fleetfizz/ui/components/server-icon";
import type { IconHandle } from "@fleetfizz/ui/hooks/use-icon-hover";
import { cn } from "@fleetfizz/ui/lib/utils";
import { motion } from "motion/react";
import {
  type ComponentType,
  createRef,
  type CSSProperties,
  type Ref,
  type RefObject,
  useEffect,
  useMemo,
} from "react";
import { APPLY, FLEET, type Phase, SHIP } from "./ship-loop";

// The Fleet as devices, for the graphics that draw Machines rather than
// dots. Each has what drifted and what the Ship did about it.

type DeviceIcon = ComponentType<{
  size?: number;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<IconHandle>;
}>;

export interface DeviceSpec {
  name: string;
  Icon: DeviceIcon;
  before: string;
  after: string;
}

export const DEVICES: readonly DeviceSpec[] = [
  { name: FLEET[0], Icon: MonitorIcon, before: "starting machine", after: "starting machine" },
  { name: FLEET[1], Icon: LaptopIcon, before: "vp 1.0.0", after: "vp → 1.1.0" },
  {
    name: FLEET[2],
    Icon: HardDriveIcon,
    before: "t3code 3f1a2b0",
    after: "t3code → 9e02bb1",
  },
  { name: FLEET[3], Icon: ServerIcon, before: "wrangler missing", after: "wrangler + 4.141.0" },
];

// A ref per device's icon, so a graphic can play each one as its Step lands.
export function useDeviceIcons() {
  return useMemo(() => DEVICES.map(() => createRef<IconHandle>()), []);
}

// Plays the Starting Machine's icon on the command, and each other device's
// icon `land(i)` seconds into APPLY.
export function usePlayOnLand(
  phase: Phase,
  icons: readonly RefObject<IconHandle | null>[],
  land: (i: number) => number,
) {
  useEffect(() => {
    if (phase === SHIP) icons[0]?.current?.startAnimation();
    if (phase !== APPLY) return;
    const timers = icons.map((icon, i) =>
      i === 0 ? null : setTimeout(() => icon.current?.startAnimation(), land(i) * 1000),
    );
    return () => timers.forEach((t) => t && clearTimeout(t));
  }, [phase, icons, land]);
}

// A device: the icon, the name, and what drifted, or what the Ship did once
// it is `lit`. `delay` is seconds until the Step lands, so the light and the
// crossfade wait for it. Lit copy is terminal green unless `onPage`, where
// it has to read on either theme.
export function Device({
  device: { Icon, name, before, after },
  lit,
  delay,
  icon,
  size = 36,
  onPage = false,
  className,
}: {
  device: DeviceSpec;
  lit: boolean;
  delay: number;
  icon: Ref<IconHandle>;
  size?: number;
  onPage?: boolean;
  className?: string;
}) {
  const green = onPage ? "text-fizz-foreground dark:text-fizz" : "text-fizz";
  const fade = { delay: lit ? delay : 0, duration: 0.25 };
  return (
    <div className={cn("flex flex-col items-center gap-2 text-center", className)}>
      <div
        className={cn("transition-[color,opacity] duration-300", lit ? green : "opacity-35")}
        style={{ transitionDelay: lit ? `${delay}s` : "0s" }}
      >
        <Icon
          ref={icon}
          size={size}
          className={cn(
            "transition-[filter] duration-300",
            lit && "drop-shadow-[0_0_10px_var(--color-fizz)]",
          )}
          style={{ transitionDelay: lit ? `${delay}s` : "0s" }}
        />
      </div>
      <span className="text-[11px] font-bold">{name}</span>
      <span className="relative block text-[10px]">
        <motion.span
          className="block opacity-40"
          animate={{ opacity: lit ? 0 : 0.4 }}
          transition={fade}
        >
          {before}
        </motion.span>
        <motion.span
          className={cn("absolute inset-0 whitespace-nowrap", green)}
          animate={{ opacity: lit ? 1 : 0 }}
          transition={{ ...fade, delay: fade.delay + 0.25 }}
        >
          {after}
        </motion.span>
      </span>
    </div>
  );
}
