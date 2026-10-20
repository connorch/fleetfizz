import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { parseConfig, readVersion } from "./load.ts";

const parse = (text: string) => Effect.result(parseConfig("config.jsonc", text));

describe("parseConfig", () => {
  it.effect("parses jsonc with comments and trailing commas", () =>
    Effect.gen(function* () {
      const result = yield* parse(`{
        "version": "0.13.0",
        "machines": ["connors-mac-studio"],
        // the vp section
        "vp": { "items": { "vercel": "*", }, },
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
      const result = yield* parse(
        '{ "version": "0.13.0", "machines": ["a"], "vp": { "platform": ["darwin"] } }',
      );
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

  it.effect("rejects fleetfizz as a Global: the config's version sets it", () =>
    Effect.gen(function* () {
      const result = yield* parse(
        '{ "version": "0.13.0", "machines": ["a"], "vp": { "items": { "fleetfizz": "0.2.0" } } }',
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.problems[0]).toContain("fleetfizz");
    }),
  );

  it.effect("names the Ship stamps a config from before the Config record still has", () =>
    Effect.gen(function* () {
      const result = yield* parse(`{ "shippedAt": "x", "shippedTo": {}, "machines": ["a"] }`);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure")
        expect(result.failure.problems).toEqual([
          "shippedAt, shippedTo: no longer written; a Ship keeps them in its Install Record now, so delete them",
        ]);
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

  it.effect("names the vp settings a Ship no longer keeps", () =>
    Effect.gen(function* () {
      const result = yield* parse(`{
        "version": "0.13.0",
        "machines": ["a"],
        "vp": { "version": "1.1.0", "node": "24.18.1", "pnpm": "^10", "items": {} }
      }`);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure")
        expect(result.failure.problems).toEqual([
          expect.stringMatching(/^vp\.version, vp\.node, vp\.pnpm: a Ship no longer keeps/),
        ]);
    }),
  );
});

describe("readVersion", () => {
  it("reads the version from any config text, without the schema", () => {
    expect(readVersion('{ "version": "0.14.0", "brand-new": { "x": 1 } }')).toBe("0.14.0");
    expect(readVersion('{ "machines": ["a"] }')).toBeUndefined();
    expect(readVersion("{ not json")).toBeUndefined();
  });
});
