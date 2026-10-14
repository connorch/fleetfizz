import "@fontsource-variable/jetbrains-mono";
import globalsCss from "@fleetfizz/ui/globals.css?url";
import { HeadContent, Outlet, Scripts, createRootRoute, useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { INK, NAME, SITE_URL, TAGLINE } from "../brand";
import { SiteFooter } from "../components/site-footer";
import { SiteNav } from "../components/site-nav";
import { themeInitScript } from "../components/theme-toggle";

const DESCRIPTION = `${TAGLINE.lead} ${TAGLINE.rest}`;
// The share image and the icons are rendered by `pnpm og` (packages/og-image).
const IMAGE = `${SITE_URL}/og.png`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: NAME },
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
      { rel: "stylesheet", href: globalsCss },
      // The .ico is for browsers and crawlers that ignore SVG favicons.
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    scripts: [{ children: themeInitScript }],
  }),
  notFoundComponent: () => (
    <main className="mx-auto w-full max-w-5xl px-6 py-24">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-muted-foreground mt-2">There is no page here.</p>
    </main>
  ),
  shellComponent: RootDocument,
  component: RootLayout,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh flex flex-col antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  const bare = useMatches({ select: (matches) => matches.some((m) => m.staticData.bare) });
  return (
    <>
      {!bare && <SiteNav />}
      <div className="flex-1">
        <Outlet />
      </div>
      <SiteFooter />
    </>
  );
}
