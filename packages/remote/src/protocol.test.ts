import { describe, expect, it } from "@effect/vitest";

import { parseLine } from "./protocol.ts";

describe("parseLine", () => {
  it("parses state, step, and done lines", () => {
    expect(parseLine('ff-state {"fact":"vp","version":"1.1.0"}')).toEqual({
      kind: "state",
      fact: { fact: "vp", version: "1.1.0" },
    });
    expect(parseLine('ff-step {"id":"repo:x:fetch"}')).toEqual({
      kind: "step",
      id: "repo:x:fetch",
    });
    expect(parseLine('ff-done {"id":"repo:x:install","ok":false,"code":1}')).toEqual({
      kind: "done",
      done: { id: "repo:x:install", ok: false, code: 1 },
    });
  });

  it("treats a cut-off or malformed protocol line as text", () => {
    expect(parseLine('ff-done {"id":"repo:x:inst')).toEqual({
      kind: "text",
      text: 'ff-done {"id":"repo:x:inst',
    });
    expect(parseLine('ff-state {"fact":"nope"}')).toEqual({
      kind: "text",
      text: 'ff-state {"fact":"nope"}',
    });
    expect(parseLine("Resolving packages...")).toEqual({
      kind: "text",
      text: "Resolving packages...",
    });
  });
});
