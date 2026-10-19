import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { parseConfig } from "./load.ts";

const parse = (text: string) => Effect.result(parseConfig("config.jsonc", text));

describe("parseConfig", () => {
  it.effect("parses jsonc with comments and trailing commas", () =>
    Effect.gen(function* () {
      const result = yield* parse(`{
        "machines": ["connors-mac-studio"],
        // the vp section
        "vp": { "version": "1.1.0", },
      }`);
      expect(result._tag).toBe("Success");
    }),
  );

  it.effect("reports a syntax error with its line", () =>
    Effect.gen(function* () {
      const result = yield* parse('{\n  "vp": {\n    "version": 1.1.0\n  }\n}');
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure.problems[0]).toMatch(/^line 3:/);
      }
    }),
  );

  it.effect("rejects unknown keys", () =>
    Effect.gen(function* () {
      const result = yield* parse('{ "machines": ["a"], "vp": { "platform": ["darwin"] } }');
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.message).toContain("platform");
    }),
  );

  it.effect("rejects a repeated key, which the parser would silently drop", () =>
    Effect.gen(function* () {
      const result = yield* parse(`{ "machines": ["a"], "repos": { "items": {
        "t3code": { "origin": "a/b", "ref": "main", "install": "x" },
        "t3code": { "origin": "c/d", "ref": "main", "install": "x" }
      } } }`);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure.problems).toEqual(['line 3: "t3code" is repeated in repos.items']);
      }
    }),
  );

  it.effect("rejects fleetfizz as a Global: the running version pins it", () =>
    Effect.gen(function* () {
      const result = yield* parse(
        '{ "machines": ["a"], "vp": { "items": { "fleetfizz": "0.2.0" } } }',
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.problems[0]).toContain("fleetfizz");
    }),
  );

  it.effect("names what moved in a config from before uniform sections", () =>
    Effect.gen(function* () {
      const result = yield* parse(`{
        "machines": { "a": { "clones": "/x" } },
        "repos": [{ "origin": "a/b", "ref": "main", "install": "x" }],
        "vp": { "globals": { "vercel": "*" } }
      }`);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure.problems).toEqual([
          "machines is now a list of names, and machines.<name>.clones is repos.cloneRoot",
          "repos is now { items: { <name>: { origin, ref, install } } }, keyed by each repo's name",
          "vp.globals is now vp.items",
        ]);
      }
    }),
  );
});
