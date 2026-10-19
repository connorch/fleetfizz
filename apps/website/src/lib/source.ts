import { flattenTree } from "fumadocs-core/page-tree";
import { type InferPageType, loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";

// The docs: the MDX under content/docs, served at /docs. Each page's body
// loads only when the page is opened; the tree and frontmatter ship eagerly.
export const docs = defineDocs({
  dir: "content/docs",
  docs: { async: true, postprocess: { includeProcessedMarkdown: true } },
});

export const source = loader({ baseUrl: "/docs", source: docs.toFumadocsSource() });

type DocsPage = InferPageType<typeof source>;

// Every page in sidebar order, for the llms.txt routes.
export const pagesInOrder = (): DocsPage[] =>
  flattenTree(source.getPageTree().children).flatMap((node) => source.getNodePage(node) ?? []);

// The Markdown copy of a page, for agents: config.mdx is /docs/config.md.
export const markdownPath = (page: Pick<DocsPage, "path">) =>
  `/docs/${page.path.replace(/\.mdx$/, ".md")}`;

export const renderMarkdown = async (page: DocsPage) =>
  [
    `# ${page.data.title}`,
    ...(page.data.description ? [`> ${page.data.description}`] : []),
    await page.data.getText("processed"),
  ].join("\n\n");

export const markdownResponse = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
