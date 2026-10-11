import globalsCss from "@fleetfizz/ui/globals.css?url";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteFooter } from "../components/site-footer";
import { SiteNav } from "../components/site-nav";
import { themeInitScript } from "../components/theme-toggle";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "fleetfizz" },
      {
        name: "description",
        content: "Keep every Machine on your tailnet in line with one config.",
      },
    ],
    links: [
      { rel: "stylesheet", href: globalsCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
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
    <html lang="en" suppressHydrationWarning>
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
  return (
    <>
      <SiteNav />
      <div className="flex-1">
        <Outlet />
      </div>
      <SiteFooter />
    </>
  );
}
