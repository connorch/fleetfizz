import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { FleetConfig } from "@fleetfizz/config";
import {
  assembleState,
  Hidden,
  type AnyProvider,
  planMachine,
  targetedItems,
  type MachineIdentity,
  type MachineState,
} from "@fleetfizz/core";
import { applyScript, applyStdin, checkScript, parseLine } from "@fleetfizz/remote";

import { files, type FilesResolved } from "./index.ts";

const STUDIO: MachineIdentity = { name: "studio", platform: "darwin" };
const MACBOOK: MachineIdentity = { name: "macbook", platform: "darwin" };

const configOf = (items: NonNullable<(typeof FleetConfig.Encoded)["files"]>) =>
  Schema.decodeSync(FleetConfig)({ machines: ["studio", "macbook"], files: items });

const decide = (input: {
  readonly state: MachineState;
  readonly resolved: FilesResolved;
  readonly machine?: MachineIdentity;
  readonly answer?: string;
  readonly config?: FleetConfig;
  readonly rebuild?: boolean;
}) => {
  const p = planMachine({
    providers: [files],
    state: input.state,
    resolved: { files: input.resolved },
    ctx: {
      machine: input.machine ?? MACBOOK,
      config: input.config ?? configOf({ items: { wovn: "~/.config/wovn" } }),
      self: "0.9.0",
      rebuild: () => input.rebuild ?? false,
      answer: (kind) => (kind === "file" ? input.answer : undefined),
    },
  });
  return p.providers[0] ?? { decisions: [], steps: [] };
};

describe("the files Provider decides", () => {
  const ours = new Map([
    [".", "d 700"],
    ["config.json", "f 600 aaa"],
  ]);
  const theirs = { ".": "d 700", "config.json": "f 600 bbb" };
  const source = (record?: { at: string; entries: Record<string, string> }): FilesResolved => ({
    from: "studio",
    at: "2026-10-20T10:00:00.000Z",
    sources: new Map([
      [
        "wovn",
        {
          kind: "present",
          entries: ours,
          ...(record === undefined ? {} : { record }),
          contents: new Map([["config.json", new Hidden("e30=")]]),
        },
      ],
    ]),
  });
  const state = (
    entries: Readonly<Record<string, string>> | undefined,
    record?: { at: string; entries: Record<string, string> },
  ) =>
    assembleState([
      ...Object.entries(entries ?? {}).map(([path, entry]) => ({
        provider: "files",
        fact: "entry",
        item: "wovn",
        path,
        entry,
        size: 1,
      })),
      ...(record === undefined
        ? []
        : [{ fact: "record", provider: "files", item: "wovn", record }]),
      { fact: "end" },
    ]);
  const kinds = (plan: ReturnType<typeof decide>) =>
    plan.decisions.map((d) => [
      d.kind,
      d.kind === "ask" ? d.question.problem : "reason" in d ? d.reason : undefined,
    ]);

  it("copies to a Machine that is missing it, or still has the copy a Ship wrote", () => {
    expect(kinds(decide({ state: state(undefined), resolved: source() }))).toEqual([
      ["change", undefined],
    ]);
    const shipped = { at: "2026-10-01T00:00:00.000Z", entries: theirs };
    expect(kinds(decide({ state: state(theirs, shipped), resolved: source(shipped) }))).toEqual([
      ["change", undefined],
    ]);
  });

  it("asks before overwriting an edit there, a copy no Ship wrote, or a newer copy", () => {
    const shipped = {
      at: "2026-10-01T00:00:00.000Z",
      entries: { ...theirs, "config.json": "f 600 old" },
    };
    expect(kinds(decide({ state: state(theirs, shipped), resolved: source(shipped) }))).toEqual([
      ["ask", "was edited there (config.json)"],
    ]);
    expect(kinds(decide({ state: state(theirs), resolved: source() }))).toEqual([
      ["ask", "differs, and no Ship wrote it"],
    ]);
    // A Ship from elsewhere reached the MacBook after the Studio's last copy.
    const newer = { at: "2026-10-12T09:30:00.000Z", entries: theirs };
    const older = { at: "2026-10-01T00:00:00.000Z", entries: Object.fromEntries(ours) };
    expect(kinds(decide({ state: state(theirs, newer), resolved: source(older) }))).toEqual([
      ["ask", "came from a Ship at 2026-10-12 09:30 that studio missed"],
    ]);
    expect(kinds(decide({ state: state(theirs), resolved: source(), answer: "skip" }))).toEqual([
      ["skip", "differs, and no Ship wrote it"],
    ]);
    expect(
      kinds(decide({ state: state(theirs), resolved: source(), answer: "overwrite" })),
    ).toEqual([["change", "differs, and no Ship wrote it"]]);
    // --rebuild all still asks: only an answer overwrites.
    expect(kinds(decide({ state: state(theirs), resolved: source(), rebuild: true }))).toEqual([
      ["ask", "differs, and no Ship wrote it"],
    ]);
  });

  it("only records a copy a Machine already has, and leaves it once recorded", () => {
    const same = Object.fromEntries(ours);
    const plan = decide({ state: state(same), resolved: source() });
    expect(kinds(plan)).toEqual([["leave", undefined]]);
    expect(plan.steps.map((s) => s.id)).toEqual(["files:wovn:record"]);
    const recorded = { at: "2026-10-20T10:00:00.000Z", entries: same };
    expect(decide({ state: state(same, recorded), resolved: source() }).steps).toEqual([]);
  });

  it("skips an Item the Starting Machine lacks or has no Variant for, and fails a kind mismatch", () => {
    const missing: FilesResolved = {
      from: "studio",
      at: "",
      sources: new Map([["wovn", { kind: "missing" }]]),
    };
    expect(kinds(decide({ state: state(undefined), resolved: missing }))).toEqual([
      ["skip", "not on studio"],
    ]);
    expect(
      kinds(decide({ state: state(undefined), resolved: { ...missing, sources: new Map() } })),
    ).toEqual([["skip", "studio has no Variant for it; ship from a Machine it targets"]]);
    expect(kinds(decide({ state: state({ ".": "f 600 ccc" }), resolved: source() }))).toEqual([
      ["fail", "a file here, a directory on studio"],
    ]);
  });
});

// A real copy on this Machine, from one directory to another: the Studio's
// Variant is `src`, the MacBook's is `dst`, and $HOME is a temporary one.
describe("the files Provider copies", () => {
  const sh = (script: string, home: string, stdin: ReadonlyArray<string> = []) =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make("/bin/sh", ["-c", script], {
          stdin: Stream.encodeText(Stream.make(stdin.map((l) => `${l}\n`).join(""))),
          stdout: "pipe",
          stderr: "pipe",
          env: { HOME: home, XDG_CONFIG_HOME: `${home}/.config` },
          extendEnv: true,
        }),
      );
      return (yield* Stream.runCollect(Stream.decodeText(handle.stdout))).join("");
    }).pipe(Effect.scoped);

  // Resolves the Studio's copy in `home`, and Checks and plans the MacBook.
  const shipFrom = Effect.fn(function* (home: string, config: FleetConfig) {
    const env = { HOME: process.env.HOME, SHELL: process.env.SHELL };
    process.env.HOME = home;
    process.env.SHELL = "/bin/sh";
    const provider: AnyProvider = files;
    const resolved = yield* provider
      .resolve([], {
        starting: { machine: STUDIO, config, items: targetedItems(files, config, STUDIO) },
      })
      .pipe(Effect.ensuring(Effect.sync(() => Object.assign(process.env, env))));

    const check = Effect.fn(function* () {
      const items = targetedItems(files, config, MACBOOK);
      const out = yield* sh(
        checkScript({
          scope: { machine: MACBOOK, config },
          providers: [{ provider: files, items }],
        }),
        home,
      );
      return assembleState(
        out.split("\n").flatMap((line) => {
          const parsed = parseLine(line);
          return parsed.kind === "state" ? [parsed.fact] : [];
        }),
      );
    });
    const planFor = (state: MachineState, answer?: string) =>
      planMachine({
        providers: [files],
        state,
        resolved: { files: resolved },
        ctx: {
          machine: MACBOOK,
          config,
          self: "0.9.0",
          rebuild: () => false,
          answer: (kind) => (kind === "file" ? answer : undefined),
        },
      });
    return { check, planFor };
  });

  it.effect("mirrors a directory with its modes and links, keeps excludes, and records it", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped();
      const config = configOf({
        items: {
          karabiner: [
            { machines: ["studio"], path: `${home}/src`, exclude: ["backups"] },
            { machines: ["macbook"], path: `${home}/dst`, exclude: ["backups"] },
          ],
        },
      });
      yield* sh(
        [
          'cd "$HOME"',
          "mkdir -p src/sub src/backups dst/sub dst/backups",
          "printf secret-a > src/a.txt && chmod 600 src/a.txt",
          "printf b > src/sub/b.txt",
          "ln -s a.txt src/link",
          "printf x > src/.DS_Store && printf old > src/backups/old.json",
          "printf stale > dst/stale.txt && printf old > dst/sub/b.txt && printf keep > dst/backups/keep.json",
        ].join(" && "),
        home,
      );

      const { check, planFor } = yield* shipFrom(home, config);

      // The first Ship: the MacBook's copy differs and no Ship wrote it.
      const first = planFor(yield* check(), "overwrite");
      const script = applyScript(first);
      expect(script).not.toContain("secret-a");
      expect(script).not.toContain(btoa("secret-a"));
      const out = yield* sh(script, home, applyStdin(undefined, "{}", "{}", first));
      expect(out).toContain('ff-done {"id":"files:karabiner:copy","ok":true}');

      const read = (path: string) => fs.readFileString(`${home}/dst/${path}`);
      expect(yield* read("a.txt")).toBe("secret-a");
      expect(((yield* fs.stat(`${home}/dst/a.txt`)).mode & 0o777).toString(8)).toBe("600");
      expect(yield* read("sub/b.txt")).toBe("b");
      expect(yield* fs.readLink(`${home}/dst/link`)).toBe("a.txt");
      expect(yield* fs.exists(`${home}/dst/stale.txt`)).toBe(false);
      expect(yield* fs.exists(`${home}/dst/.DS_Store`)).toBe(false);
      expect(yield* read("backups/keep.json")).toBe("keep");

      // The next Ship has nothing to do; an edit there asks first.
      const next = planFor(yield* check());
      expect(next.providers[0]?.decisions.map((d) => d.kind)).toEqual(["leave"]);
      expect(next.providers[0]?.steps).toEqual([]);
      yield* fs.writeFileString(`${home}/dst/sub/b.txt`, "edited");
      const edited = planFor(yield* check()).providers[0]?.decisions[0];
      expect(edited?.kind === "ask" && edited.question.problem).toBe(
        "was edited there (sub/b.txt)",
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("stops rather than delete an excluded path inside a directory it removes", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped();
      const exclude = ["gone/keep.txt"];
      const config = configOf({
        items: {
          k: [
            { machines: ["studio"], path: `${home}/src`, exclude },
            { machines: ["macbook"], path: `${home}/dst`, exclude },
          ],
        },
      });
      yield* sh(
        'cd "$HOME" && mkdir -p src dst/gone && printf a > src/a && printf x > dst/gone/x && printf keep > dst/gone/keep.txt',
        home,
      );
      const { check, planFor } = yield* shipFrom(home, config);
      const plan = planFor(yield* check(), "overwrite");
      const out = yield* sh(applyScript(plan), home, applyStdin(undefined, "{}", "{}", plan));
      expect(out).toContain('ff-done {"id":"files:k:copy","ok":false');
      expect(yield* fs.readFileString(`${home}/dst/gone/keep.txt`)).toBe("keep");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("fails an Item with a file it cannot read here, rather than treat it as removed", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped();
      const config = configOf({
        items: {
          k: [
            { machines: ["studio"], path: `${home}/src` },
            { machines: ["macbook"], path: `${home}/dst` },
          ],
        },
      });
      yield* sh('cd "$HOME" && mkdir -p src && printf a > src/a && chmod 000 src/a', home);
      const { check, planFor } = yield* shipFrom(home, config);
      const decision = planFor(yield* check()).providers[0]?.decisions[0];
      expect(decision?.kind === "fail" && decision.reason).toBe("studio: cannot read a here");
      yield* sh('chmod 600 "$HOME/src/a"', home);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
