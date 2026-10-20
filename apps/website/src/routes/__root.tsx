import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import { cn } from "@fleetfizz/ui/lib/utils";
import { HeadContent, Outlet, Scripts, createRootRoute, useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { INK, NAME, SITE_URL, TAGLINE } from "@fleetfizz/brand-assets";
import { SiteFooter } from "../components/site-footer";
import { SiteNav } from "../components/site-nav";
import { themeInitScript } from "../components/theme-toggle";
import appCss from "../styles/app.css?url";

// The home page's title; each docs page sets its own.
const TITLE = `${NAME} - Keep your dev machines in sync over Tailscale`;
const DESCRIPTION = `${TAGLINE.lead} ${TAGLINE.rest}`;
// The share image and the icons are rendered by `pnpm images` (packages/brand-assets).
const IMAGE = `${SITE_URL}/og.png`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "theme-color", content: INK },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: NAME },
      { property: "og:url", content: SITE_URL },
      { property: "og:title", content: NAME },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: `${NAME}: ${TAGLINE.lead}` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: NAME },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: IMAGE },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // The .ico is for browsers and crawlers that ignore SVG favicons.
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    scripts: [{ children: themeInitScript }],
  }),
  notFoundComponent: () => (
    <main className="mx-auto w-full max-w-6xl px-6 py-24">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-muted-foreground mt-2">There is no page here.</p>
    </main>
  ),
  shellComponent: RootDocument,
  component: RootLayout,
});

// Who draws the page's frame, from the deepest route that says (see
// StaticDataRouteOption in router.tsx).
const useChrome = () =>
  useMatches({
    select: (matches) => matches.findLast((m) => m.staticData.chrome)?.staticData.chrome,
  });

// The site is set in mono; the docs read in Geist. The font is on <body> so
// what Fumadocs portals there (the search dialog) follows the page.
function RootDocument({ children }: { children: ReactNode }) {
  const chrome = useChrome();
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className={cn("min-h-svh flex flex-col antialiased", chrome !== "docs" && "font-mono")}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  const chrome = useChrome();
  return (
    <>
      {!chrome && <SiteNav />}
      <div className="flex-1">
        <Outlet />
      </div>
      {chrome !== "docs" && <SiteFooter />}
    </>
  );
}
