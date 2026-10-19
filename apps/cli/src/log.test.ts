import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Logger from "effect/Logger";

import { KEEP, lineFormat, machineOf, parseShipId, shipId, toPrune } from "./log.ts";

describe("Ship ids", () => {
  it("name the start to the second and the Starting Machine, and parse back", () => {
    const id = shipId(DateTime.makeUnsafe("2026-10-18T14:03:22.456Z"), "connors-mac-studio");
    expect(id).toBe("2026-10-18T14-03-22Z-connors-mac-studio");
    expect(parseShipId(id)).toEqual({
      started: Date.parse("2026-10-18T14:03:22Z"),
      from: "connors-mac-studio",
    });
    expect(parseShipId("last-ship")).toBeUndefined();
  });
});

describe("toPrune", () => {
  it("deletes the oldest logs so that, with the next one, KEEP remain", () => {
    const logs = Array.from(
      { length: KEEP + 2 },
      (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}.log`,
    );
    expect(toPrune(["notes.txt", ...logs.toReversed()])).toEqual(logs.slice(0, 3));
    expect(toPrune(logs.slice(0, KEEP - 1))).toEqual([]);
  });
});

describe("lineFormat", () => {
  it.effect("prefixes every line with its Machine and phase and hides secrets", () =>
    Effect.gen(function* () {
      const lines: string[] = [];
      const logger = Logger.map(lineFormat(new Set(["gho_secret"])), (out) => {
        lines.push(...out.split("\n"));
      });
      yield* Effect.logInfo("> remote: gho_secret rejected\nsecond line").pipe(
        Effect.annotateLogs({ machine: "homelab", phase: "apply" }),
        Effect.provide(Logger.layer([logger])),
      );
      yield* Effect.logWarning("no Machine here").pipe(Effect.provide(Logger.layer([logger])));
      expect(lines.map((line) => line.replace(/^\S+/, "<time>"))).toEqual([
        "<time> INFO  [homelab apply] > remote: [hidden] rejected",
        "<time> INFO  [homelab apply] second line",
        "<time> WARN  no Machine here",
      ]);
      expect(lines.map(machineOf)).toEqual(["homelab", "homelab", undefined]);
    }),
  );
});
