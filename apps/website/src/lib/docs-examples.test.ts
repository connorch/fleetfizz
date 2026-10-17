import { parseConfig } from "@fleetfizz/config";
import { describe, expect, it } from "@effect/vitest";

const pages = import.meta.glob<string>("../../content/docs/**/*.mdx", {
  query: "?raw",
  import: "default",
  eager: true,
});

const examples = Object.entries(pages).flatMap(([path, page]) =>
  [...page.matchAll(/```jsonc title="config\.jsonc"\n([\s\S]*?)\n```/g)].map((match, index) => ({
    name: `${path.replace("../../content/docs/", "")} #${index + 1}`,
    text: match[1] ?? "",
  })),
);

// Every config.jsonc in the docs must be a config the CLI would load as written.
describe("the docs' config.jsonc examples", () => {
  it("are found", () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  for (const example of examples) {
    it.effect(`${example.name} parses as the CLI's config.jsonc`, () =>
      parseConfig(example.name, example.text),
    );
  }
});
