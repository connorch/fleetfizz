import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsLayout } from "fumadocs-ui/layouts/spacious";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/spacious/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { cn } from "@fleetfizz/ui/lib/utils";
import { type ComponentProps, Suspense, use } from "react";
import { NAME } from "@fleetfizz/brand-assets";
import { DocsSearch } from "../../components/docs-search";
import { GITHUB_URL, GithubLink } from "../../components/nav-buttons";
import { PageActions } from "../../components/page-actions";
import { ThemeToggle } from "../../components/theme-toggle";
import { Wordmark } from "../../components/wordmark";
import { docs, source } from "../../lib/source";

// Every docs page. The loader runs on the server when the page is prerendered
// and in the browser on client navigation, so there is no server function to
// host: the tree and frontmatter are in the bundle, and a page's body chunk is
// fetched here before it renders.
export const Route = createFileRoute("/docs/$")({
  loader: async ({ params }) => {
    const page = source.getPage(params._splat?.split("/").filter(Boolean));
    if (!page) throw notFound();
    await docs.getPage(page.path)?.preload();
    return { path: page.path, title: page.data.title, description: page.data.description };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} | ${NAME}` },
          ...(loaderData.description
            ? [{ name: "description", content: loaderData.description }]
            : []),
        ]
      : [],
  }),
  component: DocsRoute,
  staticData: { chrome: "docs" },
});

// The site's theme toggle stands in for Fumadocs' own, so the theme stays the
// `dark` class the rest of the site reads and writes: in the sidebar on small
// screens, and with the GitHub link at the panel's top right on large ones.
function DocsRoute() {
  const { path } = Route.useLoaderData();
  return (
    <RootProvider theme={{ enabled: false }} search={{ SearchDialog: DocsSearch }}>
      <DocsLayout
        tree={source.getPageTree()}
        nav={{ title: <Wordmark /> }}
        githubUrl={GITHUB_URL}
        slots={{ themeSwitch: ThemeToggle, actions: DocsActions }}
      >
        <Suspense>
          <Content path={path} />
        </Suspense>
      </DocsLayout>
    </RootProvider>
  );
}

function DocsActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center gap-0.5", className)} {...props}>
      <GithubLink />
      <ThemeToggle />
    </div>
  );
}

function Content({ path }: { path: string }) {
  const page = docs.getPage(path);
  if (!page) throw notFound();
  const { toc } = use(page.load());
  const Body = page.body;
  return (
    <DocsPage toc={toc}>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <PageActions path={path} />
      <DocsBody>
        <Body components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}
