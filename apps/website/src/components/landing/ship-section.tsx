import type { ReactNode } from "react";

// A Ship, told by a motion graphic beside a line of copy.
export function ShipSection({ graphic }: { graphic: ReactNode }) {
  return (
    <section className="grid gap-10 pb-20 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">One Ship</h2>
        <p className="mt-3 text-foreground/75">
          Run it on any Machine. It reads the rest over Tailscale SSH, plans the Steps, asks its
          Questions up front, and applies in parallel. Nothing runs in the background.
        </p>
      </div>
      {graphic}
    </section>
  );
}
