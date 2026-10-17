import { describe, expect, it } from "@effect/vitest";

import { parseLine } from "./protocol.ts";

describe("parseLine", () => {
  it("parses state, step, done, and skip lines", () => {
    expect(parseLine('ff-state {"provider":"vp","fact":"vp","version":"1.1.0"}')).toEqual({
      kind: "state",
      fact: { provider: "vp", fact: "vp", version: "1.1.0" },
    });
    expect(parseLine('ff-step {"id":"repos:x:fetch"}')).toEqual({
      kind: "step",
      id: "repos:x:fetch",
    });
    expect(parseLine('ff-done {"id":"repos:x:install","ok":false,"code":1}')).toEqual({
      kind: "done",
      done: { id: "repos:x:install", ok: false, code: 1 },
    });
    expect(parseLine('ff-skip {"id":"repos:x:install","reason":"depends on vp"}')).toEqual({
      kind: "skip",
      skip: { id: "repos:x:install", reason: "depends on vp" },
    });
  });

  it("treats a cut-off or malformed protocol line as text", () => {
    expect(parseLine('ff-done {"id":"repos:x:inst')).toEqual({
      kind: "text",
      text: 'ff-done {"id":"repos:x:inst',
    });
    expect(parseLine("ff-state [1]")).toEqual({ kind: "text", text: "ff-state [1]" });
    expect(parseLine("Resolving packages...")).toEqual({
      kind: "text",
      text: "Resolving packages...",
    });
  });
});
