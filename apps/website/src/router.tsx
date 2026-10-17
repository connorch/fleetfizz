import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () =>
  createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
  });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
  interface StaticDataRouteOption {
    // Who draws the page's frame. By default the root draws the site nav and
    // footer. A poster draws its own header, so the root adds only the footer;
    // the docs layout fills the window, so the root draws neither.
    chrome?: "poster" | "docs";
  }
}
