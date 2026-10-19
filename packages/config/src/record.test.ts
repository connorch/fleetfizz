import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { isNewer, mergeReached, reachedAfter, shaOf, staleWhy } from "./record.ts";

const early = "2026-10-19T10:00:00.000Z";
const late = "2026-10-19T11:00:00.000Z";

describe("reachedAfter", () => {
  it("sets the reached Machines, keeps the others, and drops Machines no longer in the Fleet", () => {
    const previous = { studio: early, macbook: early, gone: early };
    expect(reachedAfter(previous, late, ["studio"], ["studio", "macbook"])).toEqual({
      studio: late,
      macbook: early,
    });
  });
});

describe("mergeReached", () => {
  it("keeps each Machine's newest time", () => {
    expect(mergeReached([{ studio: late, macbook: early }, { macbook: late }])).toEqual({
      studio: late,
      macbook: late,
    });
  });
});

describe("staleWhy", () => {
  const record = (sha: string, reached: Record<string, string>) => ({
    ship: "2026-10-19T11-00-00Z-bluefin",
    sha,
    reached,
  });

  it("asks about a copy no Ship wrote, or one edited since", () => {
    expect(staleWhy({ machine: "macbook", sha: "a" }, {})).toBe("unrecorded");
    expect(staleWhy({ machine: "macbook", sha: "a", record: record("b", {}) }, {})).toBe("edited");
  });

  it("asks about a copy that a Ship reached after this Config last did", () => {
    const copy = { machine: "macbook", sha: "a", record: record("a", { macbook: late }) };
    expect(staleWhy(copy, { macbook: early })).toBe("newer");
    expect(staleWhy(copy, {})).toBe("newer");
    expect(staleWhy(copy, { macbook: late })).toBeUndefined();
  });

  it("compares each Machine only by its own entry", () => {
    // The copy knows of a later Ship to the studio, but not to the macbook itself.
    const copy = {
      machine: "macbook",
      sha: "a",
      record: record("a", { studio: late, macbook: early }),
    };
    expect(staleWhy(copy, { studio: early, macbook: early })).toBeUndefined();
  });
});

describe("isNewer", () => {
  it("orders ISO times, and treats a missing time as oldest", () => {
    expect(isNewer(late, early)).toBe(true);
    expect(isNewer(early, late)).toBe(false);
    expect(isNewer(early, undefined)).toBe(true);
    expect(isNewer(undefined, early)).toBe(false);
    expect(isNewer(undefined, undefined)).toBe(false);
  });
});

describe("shaOf", () => {
  it.effect("hashes the UTF-8 bytes", () =>
    Effect.gen(function* () {
      expect(yield* shaOf("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    }),
  );
});
