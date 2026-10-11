import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { parseConfig } from "./load.ts";

const parse = (text: string) => Effect.result(parseConfig("fleet.config.jsonc", text));

describe("parseConfig", () => {
  it.effect("parses jsonc with comments and trailing commas", () =>
    Effect.gen(function* () {
      const result = yield* parse(`{
        "machines": { "connors-mac-studio": {} },
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
      const result = yield* parse('{ "machines": { "a": {} }, "vp": { "platform": ["darwin"] } }');
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.message).toContain("platform");
    }),
  );

  it.effect("rejects duplicate repo names", () =>
    Effect.gen(function* () {
      const result = yield* parse(`{ "machines": { "a": {} }, "repos": [
        { "origin": "a/b", "ref": "main", "install": "x" },
        { "origin": "c/d", "ref": "main", "install": "x", "name": "a-b" }
      ] }`);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure.problems).toEqual(['repos: duplicate name "a-b"']);
      }
    }),
  );

  it.effect("rejects fleetfizz in globals: the running version pins it", () =>
    Effect.gen(function* () {
      const result = yield* parse(
        '{ "machines": { "a": {} }, "vp": { "globals": { "fleetfizz": "0.2.0" } } }',
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.problems[0]).toContain("fleetfizz");
    }),
  );
});
