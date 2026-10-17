import type { Ref } from "react";
import { TAGLINE } from "@fleetfizz/brand-assets";
import { PosterBrand } from "../poster/poster-nav";
import { Install } from "./content";
import { Ledger } from "./ledger";

// The landing page above the fold: a poster with the terminal as the object.
//
// The links are PosterHeader, pinned over the page at its top right. The hero
// keeps a blank row their height (h-7) where they would otherwise collide
// with it, and `brand` is the brand's ref, which PosterHeader watches.
//
// Wide (from 1080px, where the brand and the Ledger fit side by side): two
// rows. The brand is the first; the tagline and the install are centered in
// the space under it. The right column spans both rows: the links' row at
// the top, then the Ledger, centered on the tagline: a spacer under the
// links' row grows to the brand's height before the Ledger's margins split
// what is left. On a short screen the spacer is what gives, so the Ledger
// slides down to the bottom edge, then up to the top under the links once
// it cannot fit at all.
//
// Narrower: one column with the Ledger at full width, the links to the
// right of the brand. Narrower still (below md): everything centered, under
// the links' row.
export function Hero({
  ref,
  brand,
}: {
  ref?: Ref<HTMLDivElement>;
  brand?: Ref<HTMLAnchorElement>;
}) {
  // The brand's font size. Stacked, it tracks the viewport and tops out near
  // the size the two-column layout starts at, so the switch barely moves it.
  // Two columns, it fills what the Ledger leaves: the viewport less padding,
  // the column gap, and the Ledger (717px), over the brand's width in em.
  //
  // Two lines of the brand at its line height, less the links' row.
  const spacer = "max-h-[calc(1.64*var(--brand)-1.75rem)]";
  return (
    <div
      ref={ref}
      className="grid min-h-svh gap-x-10 gap-y-8 p-6 [--brand:clamp(4rem,13vw,7.5rem)] sm:p-10 wide:[--brand:clamp(4rem,calc((100vw_-_717px)/3.15),11rem)] wide:grid-cols-[minmax(0,1fr)_auto] wide:grid-rows-[auto_1fr] wide:gap-y-0"
    >
      <div className="flex min-w-0 flex-col items-center gap-8 md:flex-row md:items-start md:justify-between wide:contents">
        <div className="h-7 md:hidden" />
        <PosterBrand ref={brand} className="text-center md:text-left wide:justify-self-start" />
      </div>
      <div className="flex min-w-0 flex-col items-center gap-6 text-center md:items-start md:text-left wide:self-center wide:py-10">
        <p className="max-w-xl text-base text-foreground/70">
          <span className="block text-foreground">{TAGLINE.lead}</span>
          {TAGLINE.rest}
        </p>
        <Install />
      </div>
      <div className="flex min-w-0 flex-col wide:col-start-2 wide:row-span-2 wide:row-start-1 wide:items-end">
        <div className="hidden h-7 shrink-0 wide:block" />
        <div className={`hidden h-0 grow wide:block ${spacer}`} />
        <Ledger className="w-full shrink-0 wide:my-auto wide:w-fit" />
      </div>
    </div>
  );
}
