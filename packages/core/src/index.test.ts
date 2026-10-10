import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

describe("core", () => {
  it.effect("runs an Effect test", () =>
    Effect.gen(function* () {
      expect(yield* Effect.succeed(1)).toBe(1);
    }),
  );
});
