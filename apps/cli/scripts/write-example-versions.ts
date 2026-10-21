// Sets the `version` of every example config in the README and the docs to
// this package's version, so a copied example never moves fizz to another
// version (ADR 0019). The Version PR runs it after `changeset version`.
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

const EXAMPLES = ["../../../README.md", "../../website/content/docs/config.mdx"];

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const pkg = new URL("../package.json", import.meta.url).pathname;
  const { version } = JSON.parse(yield* fs.readFileString(pkg)) as { version: string };
  for (const example of EXAMPLES) {
    const path = new URL(example, import.meta.url).pathname;
    const text = yield* fs.readFileString(path);
    yield* fs.writeFileString(
      path,
      text.replaceAll(/"version": "[^"]+"/g, `"version": "${version}"`),
    );
    yield* Effect.log(`set ${path} to ${version}`);
  }
});

program.pipe(Effect.provide(NodeFileSystem.layer), NodeRuntime.runMain);
