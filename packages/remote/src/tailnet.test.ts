import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { parseTailnet } from "./tailnet.ts";

const status = {
  Self: { DNSName: "connors-mac-studio.tail.ts.net.", OS: "macOS", Online: true },
  Peer: {
    a: {
      DNSName: "connors-macbook-pro.tail.ts.net.",
      OS: "macOS",
      Online: true,
      sshHostKeys: ["k"],
    },
    b: { DNSName: "bluefin.tail.ts.net.", OS: "linux", Online: false, sshHostKeys: null },
    c: { DNSName: "iphone.tail.ts.net.", OS: "iOS", Online: true },
  },
};

describe("parseTailnet", () => {
  it.effect("names Machines by the first DNS label and drops non-Fleet OSes", () =>
    Effect.gen(function* () {
      const tailnet = yield* parseTailnet(status);
      expect(tailnet.self).toEqual({
        name: "connors-mac-studio",
        platform: "darwin",
        online: true,
        ssh: false,
      });
      expect(tailnet.fleet.map((m) => [m.name, m.platform, m.online, m.ssh])).toEqual([
        ["bluefin", "linux", false, false],
        ["connors-mac-studio", "darwin", true, false],
        ["connors-macbook-pro", "darwin", true, true],
      ]);
    }),
  );

  it.effect("fails when the Starting Machine's OS is not in the Fleet", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        parseTailnet({ Self: { DNSName: "x.ts.net.", OS: "iOS" } }),
      );
      expect(result._tag).toBe("Failure");
    }),
  );
});
