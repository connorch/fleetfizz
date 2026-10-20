import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { insertAt, removeAt, saveConfig, targetingLists } from "./edit.ts";
import { loadConfig } from "./load.ts";

const text = `{
  // the Fleet
  "machines": ["studio", "macbook"],
  "brew": {
    "items": {
      "gh": "*", // for private repos
      "jq": "*",
    },
  },
  "cask": { "items": { "ghostty": "latest" } },
}
`;

const edited = (result: ReturnType<typeof insertAt>) => ("text" in result ? result.text : result);

describe("insertAt", () => {
  it("adds a line after the last Item, keeping its comment where it was", () => {
    expect(edited(insertAt(text, ["brew", "items", "tmux"], "*"))).toBe(
      text.replace(`"jq": "*",\n`, `"jq": "*",\n      "tmux": "*",\n`),
    );
  });

  it("writes a value on one line when it fits", () => {
    expect(
      edited(insertAt(text, ["brew", "items", "tmux"], { range: "*", platforms: ["linux"] })),
    ).toContain(`      "tmux": { "range": "*", "platforms": ["linux"] },\n    },`);
  });

  it("adds to an object written on one line", () => {
    expect(edited(insertAt(text, ["cask", "items", "raycast"], "latest"))).toContain(
      `"cask": { "items": { "ghostty": "latest", "raycast": "latest" } },`,
    );
  });

  it("creates a missing section", () => {
    expect(edited(insertAt(text, ["vp", "items", "vercel"], "^59.25.4"))).toContain(
      `  "cask": { "items": { "ghostty": "latest" } },\n  "vp": { "items": { "vercel": "^59.25.4" } },\n}`,
    );
  });

  it("appends to a list", () => {
    expect(edited(insertAt(text, ["machines", 2], "homelab"))).toContain(
      `"machines": ["studio", "macbook", "homelab"],`,
    );
  });

  it("adds a comma after a last member that has none", () => {
    const plain = `{\n  "machines": ["a"],\n  "brew": { "items": {} }\n}\n`;
    expect(edited(insertAt(plain, ["cask"], { items: { ghostty: "*" } }))).toBe(
      `{\n  "machines": ["a"],\n  "brew": { "items": {} },\n  "cask": { "items": { "ghostty": "*" } }\n}\n`,
    );
    expect(edited(insertAt(plain, ["brew", "items", "gh"], "*"))).toContain(
      `"brew": { "items": { "gh": "*" } }`,
    );
  });

  it("writes a long value over several lines", () => {
    const repo = {
      origin: "connorch/t3code",
      ref: "main",
      install: "pnpm install && pnpm build:desktop && pnpm install:desktop:local",
    };
    expect(edited(insertAt(text, ["repos", "items", "t3code"], repo))).toContain(
      `  "repos": {
    "items": {
      "t3code": {
        "origin": "connorch/t3code",
        "ref": "main",
        "install": "pnpm install && pnpm build:desktop && pnpm install:desktop:local",
      },
    },
  },
}`,
    );
  });

  it("refuses what exists", () => {
    expect(insertAt(text, ["brew", "items", "gh"], "*")).toEqual({
      reason: "brew.items.gh is already in the config",
    });
  });
});

describe("removeAt", () => {
  it("removes an Item's line with its comment", () => {
    expect(edited(removeAt(text, ["brew", "items", "gh"]))).toBe(
      text.replace(`      "gh": "*", // for private repos\n`, ""),
    );
  });

  it("removes from a list on one line", () => {
    expect(edited(removeAt(text, ["machines", 0]))).toContain(`"machines": ["macbook"],`);
    expect(edited(removeAt(text, ["machines", 1]))).toContain(`"machines": ["studio"],`);
  });

  it("leaves an empty object when the last member goes", () => {
    expect(edited(removeAt(text, ["cask", "items", "ghostty"]))).toContain(
      `"cask": { "items": {} },`,
    );
  });

  it("refuses what is not there", () => {
    expect(removeAt(text, ["brew", "items", "tmux"])).toEqual({
      reason: "brew.items.tmux is not in the config",
    });
  });
});

describe("targetingLists", () => {
  it("finds every Targeting list naming a Machine, but not the Fleet itself", () => {
    const config = `{
  "machines": ["studio", "macbook"],
  "repos": { "cloneRoot": [{ "machines": ["studio"], "path": "/x" }] },
  "brew": { "items": { "tmux": { "range": "*", "machines": ["macbook", "studio"] } } },
}`;
    expect(targetingLists(config, "studio")).toEqual([
      { path: ["repos", "cloneRoot", 0, "machines"], size: 1, index: 0 },
      { path: ["brew", "items", "tmux", "machines"], size: 2, index: 1 },
    ]);
  });
});

describe("insertAt into an object with only a comment", () => {
  it("keeps the comment", () => {
    expect(
      edited(insertAt(`{ "brew": { "items": { /* add here */ } } }`, ["brew", "items", "gh"], "*")),
    ).toBe(`{ "brew": { "items": { /* add here */ "gh": "*" } } }`);
    expect(
      edited(
        insertAt(
          `{\n  "brew": {\n    "items": {\n      // add here\n    },\n  },\n}\n`,
          ["brew", "items", "gh"],
          "*",
        ),
      ),
    ).toBe(
      `{\n  "brew": {\n    "items": {\n      // add here\n      "gh": "*",\n    },\n  },\n}\n`,
    );
  });
});

describe("removeAt the only member beside a comment", () => {
  it("keeps the comment", () => {
    expect(edited(removeAt(`{ "items": { /* why */ "gh": "*" } }`, ["items", "gh"]))).toBe(
      `{ "items": { /* why */  } }`,
    );
  });
});

describe("edits beside block comments", () => {
  it("inserts after a comment that ends on the closing line", () => {
    const start = `{\n  "items": { /* why\n    add here */ },\n}\n`;
    expect(edited(insertAt(start, ["items", "gh"], "*"))).toBe(
      `{\n  "items": { /* why\n    add here */\n    "gh": "*",\n  },\n}\n`,
    );
  });

  it("keeps a comment before the last inline member it removes", () => {
    expect(edited(removeAt(`{ "gh": "*", /* why */ "jq": "*" }`, ["jq"]))).toBe(
      `{ "gh": "*" /* why */ }`,
    );
  });
});

describe("edits beside a block comment after the last member", () => {
  it("keep the comment with its member", () => {
    expect(edited(insertAt(`{ "gh": "*" /* why */ }`, ["tmux"], "*"))).toBe(
      `{ "gh": "*" /* why */, "tmux": "*" }`,
    );
    expect(edited(insertAt(`{\n  "gh": "*" /* why */\n}\n`, ["tmux"], "*"))).toBe(
      `{\n  "gh": "*", /* why */\n  "tmux": "*"\n}\n`,
    );
  });
});

describe("insertAt into a line that would grow too long", () => {
  it("puts one member per line, each as it was written", () => {
    const start = `{\n  "vp": { "version": "1.1.0", "items": { "vercel": "^64.5.0", "wrangler": "^4.136.3" } },\n}\n`;
    const result = edited(insertAt(start, ["vp", "items", "@posthog/cli"], "^0.18.9"));
    expect(result).toBe(`{
  "vp": {
    "version": "1.1.0",
    "items": { "vercel": "^64.5.0", "wrangler": "^4.136.3", "@posthog/cli": "^0.18.9" },
  },
}
`);
  });
});

describe("insertAt next to a comment inside a one-line object", () => {
  it("leaves the long line rather than lose the comment", () => {
    const start = `{\n  "vp": { "version": "1.1.0" /* pinned */, "items": { "vercel": "^64.5.0", "wrangler": "^4.136.3" } },\n}\n`;
    expect(edited(insertAt(start, ["vp", "items", "turbo"], "^2.11.3"))).toContain("/* pinned */");
  });
});

describe("saveConfig", () => {
  it.effect("refuses a symlink, working or dangling, and leaves it as it is", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const text = `{ "version": "0.2.0", "machines": ["a"] }`;
      yield* fs.writeFileString(`${dir}/real.jsonc`, text);
      yield* fs.symlink(`${dir}/real.jsonc`, `${dir}/working.jsonc`);
      yield* fs.symlink(`${dir}/missing.jsonc`, `${dir}/dangling.jsonc`);
      for (const link of ["working", "dangling"]) {
        const path = `${dir}/${link}.jsonc`;
        expect((yield* Effect.flip(loadConfig(path)))._tag).toBe("ConfigIsLink");
        const saved = yield* Effect.flip(
          saveConfig(path, `{ "version": "0.2.0", "machines": ["b"] }`),
        );
        expect(saved._tag).toBe("ConfigIsLink");
        expect(yield* fs.readLink(path)).toBe(
          `${dir}/${link === "working" ? "real" : "missing"}.jsonc`,
        );
      }
      expect(yield* fs.readFileString(`${dir}/real.jsonc`)).toBe(text);
      expect(yield* fs.exists(`${dir}/missing.jsonc`)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps the file's permissions", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(`${dir}/config.jsonc`, `{ "version": "0.2.0", "machines": ["a"] }`);
      yield* fs.chmod(`${dir}/config.jsonc`, 0o600);
      yield* saveConfig(`${dir}/config.jsonc`, `{ "version": "0.2.0", "machines": ["b"] }`);
      expect((yield* fs.stat(`${dir}/config.jsonc`)).mode & 0o777).toBe(0o600);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
