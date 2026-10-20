import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import * as Schema from "effect/Schema";

import { FleetConfig } from "@fleetfizz/config";
import {
  assembleState,
  machinesNamed,
  planMachine,
  type MachineIdentity,
  type PlanInput,
} from "@fleetfizz/core";

import { installerOf, PROVIDERS } from "./index.ts";
import { OBSERVE, REPORT } from "./skills/scripts.ts";

// A config as written, decoded as the CLI decodes it.
const decode = Schema.decodeSync(FleetConfig);

const written: typeof FleetConfig.Encoded = {
  version: "0.2.0",
  machines: ["connors-mac-studio", "connors-macbook-pro", "bluefin"],
  repos: {
    cloneRoot: [
      { machines: ["connors-mac-studio"], path: "/Volumes/StudioStack SSD/fleetfizz/clones" },
    ],
    items: {
      skills: { origin: "connorch/skills", ref: "main", install: "pnpm install" },
      psychopomp: {
        origin: "kitlangton/psychopomp",
        ref: "b517dd423fd19282898c33e43acb8eb67546ebab",
        install: "cargo build --release",
        platforms: ["darwin"],
        outputs: ["~/.local/share/psychopomp"],
      },
    },
  },
  vp: { items: { vercel: "^59.25.4", "inngest-cli": "^1.45.1", skills: "^1.7.0" } },
};
const config = decode(written);

const SKILLS_HEAD = "abc1234000000000000000000000000000000000";
const SKILLS_TIP = "def5678000000000000000000000000000000000";

const versions = {
  vercel: ["58.0.0", "59.25.4", "59.30.0", "60.1.0"],
  "inngest-cli": ["1.45.1"],
  skills: ["1.5.7", "1.7.0"],
};

const resolved: PlanInput["resolved"] = {
  vp: versions,
  npm: versions,
  pnpm: versions,
  repos: { "connorch/skills#main": { commit: SKILLS_TIP } },
  fleetfizz: { from: "connors-mac-studio", installer: "vp" },
};

const MACBOOK: MachineIdentity = { name: "connors-macbook-pro", platform: "darwin" };
const ROOT = "/Users/connor/.local/share/fleetfizz/clones";

// A package manager's Globals, as its own list prints them.
const listFact = (pm: string, output: string) => ({
  provider: pm,
  fact: "list",
  base64: btoa(String.fromCharCode(...new TextEncoder().encode(output))),
});
const vpList = (globals: ReadonlyArray<{ name: string; version: string }>) =>
  listFact("vp", JSON.stringify(globals));

// A MacBook Pro before its first Ship: old Globals, nothing cloned, and
// fleetfizz 0.1.0 installed with vp.
const facts = (over: {
  globals?: ReadonlyArray<unknown>;
  fizz?: ReadonlyArray<unknown>;
  rootPresent?: boolean;
  rootPath?: string;
  repos?: ReadonlyArray<unknown>;
  records?: ReadonlyArray<unknown>;
  homebrew?: ReadonlyArray<unknown>;
  skills?: ReadonlyArray<unknown>;
}) =>
  assembleState([
    { fact: "home", path: "/Users/connor" },
    ...(over.globals ?? [
      vpList([
        { name: "vercel", version: "58.0.0" },
        { name: "skills", version: "1.7.0" },
      ]),
    ]),
    ...(over.fizz ?? [
      {
        provider: "fleetfizz",
        fact: "fizz",
        path: "/Users/connor/.local/share/vite-plus/bin/fizz",
        real: "/Users/connor/.local/share/vite-plus/bin/fizz",
        version: "0.1.0",
      },
      { provider: "fleetfizz", fact: "manager", name: "vp" },
      { provider: "fleetfizz", fact: "manager", name: "npm" },
    ]),
    {
      provider: "repos",
      fact: "cloneRoot",
      path: over.rootPath ?? ROOT,
      present: over.rootPresent ?? true,
    },
    ...(over.repos ?? []),
    ...(over.records ?? []),
    ...(over.homebrew ?? []),
    ...(over.skills ?? []),
    { fact: "end" },
  ]);

const plan = (over: {
  state?: ReturnType<typeof facts>;
  machine?: MachineIdentity;
  answers?: Readonly<Record<string, string>>;
  rebuild?: ReadonlyArray<string>;
  resolved?: PlanInput["resolved"];
  config?: FleetConfig;
}) =>
  planMachine({
    providers: PROVIDERS,
    state: over.state ?? facts({}),
    resolved: over.resolved ?? resolved,
    ctx: {
      machine: over.machine ?? MACBOOK,
      config: over.config ?? config,
      rebuild: (a) => over.rebuild?.includes(a) ?? false,
      answer: (kind, subject) => over.answers?.[`${kind}:${subject}`],
    },
  });

const provider = (result: ReturnType<typeof plan>, name: string) => {
  const found = result.providers.find((p) => p.name === name);
  if (found === undefined) throw new Error(`no ${name} plan`);
  return found;
};
const stepIds = (result: ReturnType<typeof plan>) =>
  result.providers.flatMap((p) => p.steps.map((s) => s.id));

// Runs a command with HOME set to `home`: its trimmed stdout and exit code.
const exec = (command: string, args: ReadonlyArray<string>, home: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, args, {
          stdout: "pipe",
          stderr: "pipe",
          env: { HOME: home },
          extendEnv: true,
        }),
      );
      const [out, , code] = yield* Effect.all(
        [
          Stream.runCollect(Stream.decodeText(handle.stdout)),
          Stream.runDrain(handle.stderr),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      );
      return { out: out.join("").trim(), code };
    }),
  );

describe("the package-manager Providers", () => {
  it("keeps each Global inside its Range with one install", () => {
    const vp = provider(plan({}), "vp");
    expect(vp.decisions).toEqual([
      expect.objectContaining({ kind: "change", item: "vercel", from: "58.0.0", to: "59.30.0" }),
      expect.objectContaining({ kind: "change", item: "inngest-cli", to: "1.45.1" }),
      { kind: "leave", item: "skills", at: "1.7.0" },
    ]);
    expect(vp.steps.map((s) => [s.id, s.run])).toEqual([
      ["vp:globals:install", ["( command vp install -g 'vercel@59.30.0' 'inngest-cli@1.45.1' )"]],
    ]);
  });

  it("reads and installs with each package manager's own commands", () => {
    const withPm = (pm: "npm" | "bun" | "pnpm", output: string) => {
      const result = plan({
        config: decode({
          version: "0.2.0",
          machines: written.machines,
          [pm]: { items: { vercel: "^59.25.4" } },
        }),
        state: facts({ globals: [listFact(pm, output)] }),
        resolved: { ...resolved, [pm]: versions },
      });
      const p = provider(result, pm);
      return [p.decisions[0], p.steps[0]?.run[0]];
    };
    expect(
      withPm("npm", JSON.stringify({ dependencies: { vercel: { version: "59.30.0" } } })),
    ).toEqual([{ kind: "leave", item: "vercel", at: "59.30.0" }, undefined]);
    expect(
      withPm("pnpm", JSON.stringify([{ dependencies: { vercel: { version: "58.0.0" } } }])),
    ).toEqual([
      expect.objectContaining({ kind: "change", from: "58.0.0", to: "59.30.0" }),
      "( command pnpm add -g 'vercel@59.30.0' )",
    ]);
    expect(
      withPm(
        "bun",
        "/Users/connor/.bun/install/global node_modules (2)\n├── @scope/x@1.0.0\n└── vercel@59.25.4\n",
      ),
    ).toEqual([{ kind: "leave", item: "vercel", at: "59.25.4" }, undefined]);
    expect(withPm("bun", "")[1]).toBe("( command bun add -g 'vercel@59.30.0' )");
  });

  it("fails without its package manager, or waits for one another installs in this Ship", () => {
    const pnpmConfig = (npm: boolean) =>
      decode({
        version: "0.2.0",
        machines: written.machines,
        ...(npm ? { npm: { items: { pnpm: "^10" } } } : {}),
        pnpm: { items: { vercel: "^59.25.4" } },
      });
    const missing = [{ provider: "pnpm", fact: "missing" }];
    const vercel = (npm: boolean) =>
      provider(plan({ config: pnpmConfig(npm), state: facts({ globals: missing }) }), "pnpm")
        .decisions[0];
    expect(vercel(false)).toEqual({
      kind: "fail",
      item: "vercel",
      reason: "pnpm is not installed",
    });
    expect(vercel(true)).toEqual({
      kind: "skip",
      item: "vercel",
      reason: "waits for pnpm, which npm installs in this Ship; ship again",
    });
    // pnpm in its own section keeps itself updated, and cannot install itself.
    const own = Schema.decodeSync(FleetConfig)({
      version: "0.2.0",
      machines: written.machines,
      pnpm: { items: { pnpm: "^10", vercel: "^59.25.4" } },
    });
    expect(
      provider(plan({ config: own, state: facts({ globals: missing }) }), "pnpm").decisions[0],
    ).toMatchObject({ kind: "fail", reason: "pnpm is not installed" });
    // vp's command comes from the vite-plus package.
    const vp = Schema.decodeSync(FleetConfig)({
      version: "0.2.0",
      machines: written.machines,
      npm: { items: { "vite-plus": "*" } },
      vp: { items: { vercel: "^59.25.4" } },
    });
    expect(
      provider(
        plan({ config: vp, state: facts({ globals: [{ provider: "vp", fact: "missing" }] }) }),
        "vp",
      ).decisions[0],
    ).toMatchObject({
      kind: "skip",
      reason: "waits for vp, which npm installs in this Ship; ship again",
    });
  });

  it("asks about a Global above its Range, and honors answers", () => {
    const state = facts({ globals: [vpList([{ name: "vercel", version: "60.1.0" }])] });
    const vercel = (answers?: Readonly<Record<string, string>>) =>
      provider(plan({ state, ...(answers === undefined ? {} : { answers }) }), "vp").decisions.find(
        (d) => d.item === "vercel",
      );
    expect(vercel()).toMatchObject({
      kind: "ask",
      question: {
        kind: "range",
        subject: "vp:vercel",
        found: "60.1.0",
        default: "skip",
        bump: { path: ["vp", "items", "vercel", "range"], range: "^59.25.4" },
      },
    });
    expect(vercel({ "range:vp:vercel": "skip" })).toEqual({
      kind: "skip",
      item: "vercel",
      at: "60.1.0",
      reason: "is above ^59.25.4",
    });
    expect(vercel({ "range:vp:vercel": "downgrade" })).toMatchObject({
      kind: "change",
      from: "60.1.0",
      to: "59.30.0",
    });
  });

  it("holds nothing back by default, but does what a section's dependsOn says", () => {
    const failing = facts({ globals: [{ provider: "vp", fact: "missing" }] });
    const repos = (dependsOn: boolean) =>
      provider(
        plan({
          state: failing,
          config: decode({
            ...written,
            repos: { ...written.repos, ...(dependsOn ? { dependsOn: ["vp"] } : {}) },
          }),
        }),
        "repos",
      ).decisions.map((d) => d.kind);
    expect(repos(false)).toEqual(["change", "change"]);
    expect(repos(true)).toEqual(["skip", "skip"]);
  });
});

describe("the fleetfizz Provider", () => {
  const fizz = (path: string, version: string, real = path) => ({
    provider: "fleetfizz",
    fact: "fizz",
    path,
    real,
    version,
  });
  const managers = (...names: string[]) =>
    names.map((name) => ({ provider: "fleetfizz", fact: "manager", name }));
  const decide = (over: {
    fizz?: ReadonlyArray<unknown>;
    machine?: MachineIdentity;
    resolved?: unknown;
  }) => {
    const p = provider(
      plan({
        state: facts({ fizz: over.fizz ?? [] }),
        ...(over.machine === undefined ? {} : { machine: over.machine }),
        ...(over.resolved === undefined
          ? {}
          : { resolved: { ...resolved, fleetfizz: over.resolved } }),
      }),
      "fleetfizz",
    );
    return [p.decisions[0], p.steps[0]?.run[0]];
  };

  it("runs last, after every Provider with a section", () => {
    expect(plan({}).providers.map((p) => p.name)).toEqual([
      "brew",
      "cask",
      "files",
      "vp",
      "npm",
      "bun",
      "pnpm",
      "skills",
      "repos",
      "fleetfizz",
    ]);
  });

  it("moves fizz to the config's version with the package manager that installed it", () => {
    expect(
      decide({
        fizz: [fizz("/Users/connor/.local/share/vite-plus/bin/fizz", "0.1.0"), ...managers("vp")],
      }),
    ).toEqual([
      expect.objectContaining({ kind: "change", from: "0.1.0", to: "0.2.0" }),
      "( command vp install -g 'fleetfizz@0.2.0' )",
    ]);
    // Newer moves too: the config wins.
    expect(
      decide({
        fizz: [
          fizz(
            "/opt/homebrew/bin/fizz",
            "0.3.0",
            "/opt/homebrew/lib/node_modules/fleetfizz/dist/fleetfizz.mjs",
          ),
          ...managers("npm"),
        ],
      }),
    ).toEqual([
      expect.objectContaining({ kind: "change", from: "0.3.0", to: "0.2.0" }),
      "( command npm install -g 'fleetfizz@0.2.0' )",
    ]);
    expect(decide({ fizz: [fizz("/Users/connor/Library/pnpm/fizz", "0.2.0")] })[0]).toEqual({
      kind: "leave",
      item: "fleetfizz",
      at: "0.2.0",
    });
    expect(decide({ fizz: [fizz("/Users/connor/code/fleetfizz/fizz", "0.1.0")] })[0]).toMatchObject(
      {
        kind: "fail",
        reason: expect.stringContaining("install fleetfizz@0.2.0 there"),
      },
    );
    // The package manager that installed it is gone.
    expect(decide({ fizz: [fizz("/Users/connor/.bun/bin/fizz", "0.1.0")] })[0]).toMatchObject({
      kind: "fail",
      reason: "bun installed fizz here but is not on PATH; install fleetfizz@0.2.0 there",
    });
  });

  it("installs a missing fizz with the Starting Machine's package manager, when it is here", () => {
    expect(decide({ fizz: managers("vp") })[1]).toBe("( command vp install -g 'fleetfizz@0.2.0' )");
    expect(decide({ fizz: managers("npm") })[0]).toEqual({
      kind: "skip",
      item: "fleetfizz",
      reason: "no vp here",
    });
    expect(
      decide({
        fizz: managers("vp"),
        resolved: { from: "connors-mac-studio", installer: undefined },
      })[0],
    ).toMatchObject({ kind: "skip", reason: expect.stringContaining("none to install it with") });
  });

  it("leaves the Starting Machine alone: it already runs the config's version", () => {
    expect(
      decide({
        machine: { name: "connors-mac-studio", platform: "darwin" },
        fizz: [fizz("/Users/connor/code/fleetfizz/fizz", "0.1.0")],
      })[0],
    ).toEqual({ kind: "leave", item: "fleetfizz", at: "0.2.0" });
  });

  it("tells which package manager installed a fizz from its paths", () => {
    expect(
      installerOf([
        "/Users/connor/.local/share/vite-plus/packages/fleetfizz/x/lib/node_modules/fleetfizz/dist/fleetfizz.mjs",
      ]),
    ).toBe("vp");
    expect(
      installerOf([
        "/Users/connor/Library/pnpm/global/v11/.pnpm/fleetfizz@0.2.0/node_modules/fleetfizz/dist/fleetfizz.mjs",
      ]),
    ).toBe("pnpm");
    expect(installerOf(["/Users/connor/.bun/bin/fizz"])).toBe("bun");
    // Custom PNPM_HOME and BUN_INSTALL: the store paths still say which.
    expect(
      installerOf(["/opt/tools/global/5/.pnpm/fleetfizz@0.2.0/node_modules/fleetfizz/dist/x.mjs"]),
    ).toBe("pnpm");
    expect(installerOf(["/opt/bun/install/global/node_modules/fleetfizz/dist/fleetfizz.mjs"])).toBe(
      "bun",
    );
    expect(
      installerOf([
        "/Users/connor/.nvm/versions/node/v24.1.0/lib/node_modules/fleetfizz/dist/fleetfizz.mjs",
      ]),
    ).toBe("npm");
    expect(
      installerOf(["/Users/connor/code/fleetfizz/apps/cli/dist/fleetfizz.mjs"]),
    ).toBeUndefined();
  });
});

describe("the repos Provider", () => {
  const skillsClone = (head: string) => ({
    provider: "repos",
    fact: "repo",
    name: "skills",
    present: true,
    head,
    origin: "https://github.com/connorch/skills.git",
  });
  const skillsRecord = (commit: string) => ({
    fact: "record",
    provider: "repos",
    item: "skills",
    record: {
      commit,
      path: `${ROOT}/skills`,
      install: "pnpm install",
      outputs: {},
    },
  });

  it("plans a first fetch and install for every targeted repo", () => {
    const repos = provider(plan({}), "repos");
    expect(repos.decisions).toEqual([
      expect.objectContaining({
        kind: "change",
        item: "skills",
        to: "def5678",
        reason: "never installed",
      }),
      expect.objectContaining({
        kind: "change",
        item: "psychopomp",
        to: "b517dd4",
        reason: "never installed",
      }),
    ]);
    expect(repos.steps.map((s) => s.id)).toEqual([
      "repos:skills:fetch",
      "repos:skills:install",
      "repos:psychopomp:fetch",
      "repos:psychopomp:install",
    ]);
    // A branch resets to the commit resolved for this Ship.
    expect(repos.steps[0]?.run).toContain(`  git -C "$ff_d" reset --quiet --hard '${SKILLS_TIP}'`);
  });

  it("leaves a repo whose record matches, still resetting it, and reinstalls on --rebuild", () => {
    const state = facts({ repos: [skillsClone(SKILLS_TIP)], records: [skillsRecord(SKILLS_TIP)] });
    const repos = provider(plan({ state }), "repos");
    expect(repos.decisions[0]).toMatchObject({
      kind: "leave",
      item: "skills",
      at: "def5678",
    });
    // A Managed Clone is reset on every Ship, without reinstalling.
    expect(repos.steps.map((s) => s.id)).toContain("repos:skills:fetch");
    expect(repos.steps.map((s) => s.id)).not.toContain("repos:skills:install");
    expect(
      provider(plan({ state, rebuild: ["repos:skills"] }), "repos").decisions[0],
    ).toMatchObject({ kind: "change", reason: "--rebuild" });
  });

  it("refetches a new commit, and a clone moved off its recorded commit", () => {
    const behind = facts({
      repos: [skillsClone(SKILLS_HEAD)],
      records: [skillsRecord(SKILLS_HEAD)],
    });
    expect(provider(plan({ state: behind }), "repos").decisions[0]).toMatchObject({
      kind: "change",
      from: "abc1234",
      to: "def5678",
      reason: "new commit def5678",
    });
    const moved = facts({ repos: [skillsClone(SKILLS_HEAD)], records: [skillsRecord(SKILLS_TIP)] });
    expect(provider(plan({ state: moved }), "repos").decisions[0]).toMatchObject({
      kind: "change",
      reason: "checked out at abc1234",
    });
  });

  // Runs the fetch step for skills against a real clone, in a temp HOME that
  // holds the MacBook's Clone Root (~/.local/share/fleetfizz/clones). ff_git,
  // the network fetch, leaves a mark and fails if it is called.
  it.effect("fetches only when the clone is not at the resolved commit", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped();
      const clone = `${home}/.local/share/fleetfizz/clones/skills`;
      const run = (command: string, ...args: string[]) => exec(command, args, home);
      const git = (...args: string[]) =>
        run("git", "-C", clone, ...args).pipe(Effect.map((r) => r.out));
      yield* run("git", "init", "--quiet", clone);
      yield* git("remote", "add", "origin", "https://github.com/connorch/skills.git");
      const commit = Effect.gen(function* () {
        yield* git(
          "-c",
          "user.name=t",
          "-c",
          "user.email=t@t",
          "commit",
          "--quiet",
          "--allow-empty",
          "-m",
          "c",
        );
        return yield* git("rev-parse", "HEAD");
      });
      const first = yield* commit;
      const second = yield* commit;
      const fetchStep = (head: string) => {
        const step = provider(
          plan({
            state: facts({ repos: [skillsClone(head)] }),
            resolved: { ...resolved, repos: { "connorch/skills#main": { commit: second } } },
          }),
          "repos",
        ).steps.find((s) => s.id === "repos:skills:fetch");
        if (step === undefined) throw new Error("no fetch step");
        return [`ff_git() { touch "$HOME/fetched"; return 1; }`, ...step.run].join("\n");
      };

      // At the commit already: no fetch, and the clone is still cleaned.
      yield* fs.writeFileString(`${clone}/stray.txt`, "");
      expect((yield* run("/bin/sh", "-c", fetchStep(second))).code).toBe(0);
      expect(yield* fs.exists(`${home}/fetched`)).toBe(false);
      expect(yield* fs.exists(`${clone}/stray.txt`)).toBe(false);

      // Behind it: the step fetches.
      yield* git("reset", "--quiet", "--hard", first);
      expect((yield* run("/bin/sh", "-c", fetchStep(first))).code).not.toBe(0);
      expect(yield* fs.exists(`${home}/fetched`)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it("fails repos when the Clone Root is not mounted, without touching vp", () => {
    const result = plan({
      machine: { name: "connors-mac-studio", platform: "darwin" },
      state: facts({ rootPath: "/Volumes/StudioStack SSD/fleetfizz/clones", rootPresent: false }),
    });
    expect(provider(result, "repos").decisions.map((d) => d.kind)).toEqual(["fail", "fail"]);
    expect(provider(result, "vp").steps.length).toBeGreaterThan(0);
  });

  it("creates a missing Clone Root under ~ instead of failing", () => {
    const repos = provider(plan({ state: facts({ rootPresent: false }) }), "repos");
    expect(repos.decisions.map((d) => d.kind)).toEqual(["change", "change"]);
    expect(repos.steps[0]?.run).toContain(`mkdir -p "$ff_root"`);
  });

  it("fails a branch that could not be resolved", () => {
    const repos = provider(
      plan({
        resolved: {
          ...resolved,
          repos: { "connorch/skills#main": { error: "no branch main on origin" } },
        },
      }),
      "repos",
    );
    expect(repos.decisions[0]).toMatchObject({ kind: "fail", reason: "no branch main on origin" });
  });

  it("applies Targeting per Platform", () => {
    const linux = plan({ machine: { name: "bluefin", platform: "linux" } });
    expect(provider(linux, "repos").decisions.map((d) => d.item)).toEqual(["skills"]);
    expect(stepIds(linux)).not.toContain("repos:psychopomp:fetch");
  });
});

describe("Variants", () => {
  const BLUEFIN: MachineIdentity = { name: "bluefin", platform: "linux" };
  const variants = decode({
    ...written,
    repos: {
      items: {
        skills: [
          { platforms: ["linux"], origin: "connorch/skills", ref: "linux", install: "make" },
          { origin: "connorch/skills", ref: "main", install: "pnpm install" },
        ],
      },
    },
    vp: { items: { vercel: [{ machines: ["bluefin"], range: "^60.0.0" }, "^59.25.4"] } },
  });
  const installOf = (result: ReturnType<typeof plan>) =>
    provider(result, "repos")
      .steps.find((s) => s.id === "repos:skills:install")
      ?.run.join("\n");

  it("gives each Machine the first Variant that targets it", () => {
    const linux = plan({
      config: variants,
      machine: BLUEFIN,
      resolved: { ...resolved, repos: { "connorch/skills#linux": { commit: SKILLS_HEAD } } },
    });
    expect(provider(linux, "repos").decisions[0]).toMatchObject({ item: "skills", to: "abc1234" });
    expect(installOf(linux)).toContain("make");
    expect(installOf(plan({ config: variants }))).toContain("pnpm install");
  });

  it("bumps the Variant the Machine got", () => {
    const state = facts({ globals: [vpList([{ name: "vercel", version: "60.1.0" }])] });
    const vercel = provider(plan({ config: variants, state }), "vp").decisions.find(
      (d) => d.item === "vercel",
    );
    expect(vercel).toMatchObject({
      kind: "ask",
      question: { bump: { path: ["vp", "items", "vercel", 1, "range"], range: "^59.25.4" } },
    });
  });

  it("names every Machine a Variant or cloneRoot targets, for the unknown-Machine check", () => {
    const repos = PROVIDERS.find((p) => p.name === "repos");
    const vp = PROVIDERS.find((p) => p.name === "vp");
    if (repos === undefined || vp === undefined) throw new Error("no repos or vp Provider");
    expect(machinesNamed(repos, config)).toEqual(["connors-mac-studio"]);
    expect(machinesNamed(vp, variants)).toEqual(["bluefin"]);
  });

  it("leaves out an Item with no Variant for the Machine", () => {
    const linuxOnly = decode({
      version: "0.2.0",
      machines: written.machines,
      vp: { items: { vercel: [{ platforms: ["linux"], range: "*" }] } },
    });
    const items = provider(plan({ config: linuxOnly }), "vp").decisions.map((d) => d.item);
    expect(items).not.toContain("vercel");
  });
});

describe("the brew and cask Providers", () => {
  const homebrew = decode({
    ...written,
    brew: { items: { gh: "*", tmux: "latest", jq: "*", "oven-sh/bun/bun": "latest" } },
    cask: { items: { ghostty: "latest", raycast: "*" } },
  });
  // Homebrew 4.6.0 with gh and tmux installed, and the ghostty Cask.
  const installed = [
    ...(["brew", "cask"] as const).map((p) => ({ provider: p, fact: "brew", version: "4.6.0" })),
    { provider: "brew", fact: "at", item: "gh", at: "2.80.0" },
    { provider: "brew", fact: "at", item: "tmux", at: "3.5a" },
    { provider: "cask", fact: "at", item: "ghostty", at: "1.2.0" },
  ];
  const noBrew = (["brew", "cask"] as const).map((p) => ({
    provider: p,
    fact: "brew",
    version: null,
  }));

  it("installs missing packages and upgrades latest ones, one batch Step each", () => {
    // A batch with a "latest" Item runs brew update first.
    const result = plan({ config: homebrew, state: facts({ homebrew: installed }) });
    expect(provider(result, "brew").decisions).toEqual([
      { kind: "leave", item: "brew", at: "4.6.0" },
      { kind: "leave", item: "gh", at: "2.80.0" },
      expect.objectContaining({ kind: "change", item: "tmux", from: "3.5a", to: "latest" }),
      expect.objectContaining({ kind: "change", item: "jq", to: "latest" }),
      expect.objectContaining({ kind: "change", item: "oven-sh/bun/bun", to: "latest" }),
    ]);
    const steps = result.providers
      .filter((p) => p.name === "brew" || p.name === "cask")
      .flatMap((p) => p.steps.map((s) => [s.id, s.items, s.run.join("").includes("brew update")]));
    expect(steps).toEqual([
      ["brew:formulae:install", ["jq", "oven-sh/bun/bun"], true],
      ["brew:formulae:upgrade", ["tmux"], true],
      ["cask:casks:install", ["raycast"], false],
      ["cask:casks:upgrade", ["ghostty"], true],
    ]);
  });

  it("fails brew:brew without Homebrew, skipping Formulae and failing Casks", () => {
    const result = plan({ config: homebrew, state: facts({ homebrew: noBrew }) });
    const brew = provider(result, "brew");
    expect(brew.decisions[0]).toEqual({
      kind: "fail",
      item: "brew",
      reason: "Homebrew is not installed; install it first",
    });
    expect(brew.decisions.slice(1).map((d) => d.kind)).toEqual(["skip", "skip", "skip", "skip"]);
    expect(provider(result, "cask").decisions.map((d) => d.kind)).toEqual(["fail", "fail"]);
    expect(stepIds(result).filter((id) => id.startsWith("brew") || id.startsWith("cask"))).toEqual(
      [],
    );
  });

  it("fails Casks on linux", () => {
    const linux = plan({
      config: homebrew,
      machine: { name: "bluefin", platform: "linux" },
      state: facts({ homebrew: installed }),
    });
    expect(provider(linux, "cask").decisions.map((d) => d.kind)).toEqual(["fail", "fail"]);
  });

  it("plans nothing for a Provider without a section", () => {
    const result = plan({ state: facts({ homebrew: installed }) });
    expect(provider(result, "brew").decisions).toEqual([]);
    expect(provider(result, "cask").decisions).toEqual([]);
  });
});

describe("the skills Provider", () => {
  const withSkills = decode({
    ...written,
    skills: {
      agents: ["claude-code", "codex"],
      items: {
        grilling: "mattpocock/skills",
        "grill-me": "mattpocock/skills",
        "find-skills": { source: "vercel-labs/skills", ref: "v2", agents: ["claude-code"] },
        local: "https://example.com/skills.git",
      },
    },
  });
  const OLD = "1111111000000000000000000000000000000000";
  const TIP = "2222222000000000000000000000000000000000";
  const EDITED = "3333333000000000000000000000000000000000";
  const at = (hash: string) => hash.slice(0, 7);
  const tips: PlanInput["resolved"] = {
    ...resolved,
    skills: {
      "mattpocock/skills#": {
        folders: new Map([
          ["skills/productivity/grilling", TIP],
          ["skills/productivity/grill-me", TIP],
        ]),
      },
      "vercel-labs/skills#v2": { folders: new Map([["skills/find-skills", TIP]]) },
    },
  };
  // A skill the CLI installed from `source`: its folder, and its lock entry.
  const installed = (
    name: string,
    source: string,
    hash: string,
    over: { folder?: string; ref?: string; folderOf?: string } = {},
  ) => ({
    provider: "skills",
    fact: "skill",
    name,
    path: `/Users/connor/.agents/skills/${name}`,
    hash: over.folder ?? hash,
    lock: {
      source,
      sourceType: "github",
      ...(over.ref === undefined ? {} : { ref: over.ref }),
      skillPath: `${over.folderOf ?? `skills/productivity/${name}`}/SKILL.md`,
      hash,
    },
  });
  // Install Records: the agents a Ship installed each skill for.
  const shipped = (names: ReadonlyArray<string>, agents = ["claude-code", "codex"]) =>
    names.map((item) => ({ fact: "record", provider: "skills", item, record: { agents } }));
  const all = ["grilling", "grill-me", "find-skills", "local"];
  const state = (skills: ReadonlyArray<unknown>, records: ReadonlyArray<unknown> = shipped(all)) =>
    facts({ skills: [{ provider: "skills", fact: "cli", present: true }, ...skills], records });
  const current = [
    installed("grilling", "mattpocock/skills", TIP),
    installed("grill-me", "mattpocock/skills", OLD),
    installed("find-skills", "vercel-labs/skills", TIP, {
      ref: "v2",
      folderOf: "skills/find-skills",
    }),
    {
      provider: "skills",
      fact: "skill",
      name: "local",
      path: "/Users/connor/.agents/skills/local",
      lock: { source: "https://example.com/skills.git", sourceType: "git", hash: "abc" },
    },
  ];

  it("installs missing skills with one skills add per source and agents, then records them", () => {
    const result = plan({ config: withSkills, resolved: tips, state: state([], []) });
    expect(provider(result, "skills").decisions.map((d) => [d.item, d.kind])).toEqual(
      all.map((name) => [name, "change"]),
    );
    const steps = provider(result, "skills").steps;
    expect(steps.map((s) => [s.id, s.items, s.run[0]])).toEqual([
      [
        "skills:grilling:install",
        ["grilling", "grill-me"],
        "ff_o=$(ff_skills add 'mattpocock/skills' -g -y --json -s 'grilling' 'grill-me' -a 'claude-code' 'codex')",
      ],
      [
        "skills:find-skills:install",
        ["find-skills"],
        "ff_o=$(ff_skills add 'vercel-labs/skills#v2' -g -y --json -s 'find-skills' -a 'claude-code')",
      ],
      [
        "skills:local:install",
        ["local"],
        "ff_o=$(ff_skills add 'https://example.com/skills.git' -g -y --json -s 'local' -a 'claude-code' 'codex')",
      ],
    ]);
  });

  // The Check's program, against a stand-in skills CLI that lists one folder.
  it.effect("observes each skill's folder, lock entry, and tree hash", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped();
      const folder = `${home}/.agents/skills/grilling`;
      yield* fs.makeDirectory(`${home}/bin`, { recursive: true });
      yield* fs.makeDirectory(folder, { recursive: true });
      yield* fs.writeFileString(`${folder}/SKILL.md`, "---\nname: grilling\n---\n");
      yield* fs.writeFileString(
        `${home}/bin/skills`,
        `#!/bin/sh\nprintf '[{"name":"grilling","path":"${folder}","agents":[]}]'\n`,
      );
      yield* fs.chmod(`${home}/bin/skills`, 0o755);
      // The tree hash git itself gives the folder, as GitHub would.
      const tree = yield* exec(
        "sh",
        ["-c", `cd "${folder}" && git init -q && git add -A && git write-tree`],
        home,
      );
      yield* fs.remove(`${folder}/.git`, { recursive: true });
      yield* fs.writeFileString(
        `${home}/.agents/.skill-lock.json`,
        `{"version":3,"skills":{"grilling":{"source":"mattpocock/skills","sourceType":"github","skillPath":"skills/grilling/SKILL.md","skillFolderHash":"${tree.out}"}}}`,
      );
      const { out } = yield* exec(
        "sh",
        [
          "-c",
          `PATH="$HOME/bin:$PATH" node -e "$1" '[["grilling","grill-me"],["claude-code"]]'`,
          "sh",
          OBSERVE,
        ],
        home,
      );
      expect(out.split("\n")).toEqual([
        `ff-state {"provider":"skills","fact":"skill","name":"grilling","path":"${folder}","hash":"${tree.out}","lock":{"source":"mattpocock/skills","sourceType":"github","skillPath":"skills/grilling/SKILL.md","hash":"${tree.out}"}}`,
        'ff-state {"provider":"skills","fact":"skill","name":"grill-me"}',
      ]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  // The report the install Step pipes the CLI's --json result into.
  it.effect("records only skills the CLI installed for every agent, and fails otherwise", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped();
      const results =
        '[{"name":"grilling","status":"installed","agents":["Claude Code","Codex"]},' +
        '{"name":"grill-me","status":"installed","agents":["Claude Code"]},' +
        '{"name":"nope","status":"skipped"}]';
      const report = (names: string) =>
        exec(
          "sh",
          [
            "-c",
            `printf '%s' "$1" | node -e "$2" "$3" "$HOME/records"`,
            "sh",
            results,
            REPORT,
            `[${names},["claude-code","codex"]]`,
          ],
          home,
        );
      expect((yield* report('["grilling","grill-me","nope"]')).code).toBe(1);
      expect(yield* fs.readDirectory(`${home}/records`)).toEqual(["grilling.json"]);
      expect(yield* fs.readFileString(`${home}/records/grilling.json`)).toBe(
        '{"agents":["claude-code","codex"]}\n',
      );
      expect((yield* report('["grilling"]')).code).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it("leaves a skill at its ref's hash, updates one whose source moved, and reinstalls on --rebuild", () => {
    const result = plan({ config: withSkills, resolved: tips, state: state(current) });
    expect(provider(result, "skills").decisions).toEqual([
      { kind: "leave", item: "grilling", at: at(TIP) },
      expect.objectContaining({
        kind: "change",
        item: "grill-me",
        from: at(OLD),
        to: at(TIP),
        reason: "its source moved",
      }),
      { kind: "leave", item: "find-skills", at: at(TIP) },
      // Not on GitHub: installed when missing, never checked.
      { kind: "leave", item: "local", at: "abc" },
    ]);
    const rebuilt = plan({
      config: withSkills,
      resolved: tips,
      state: state(current),
      rebuild: ["skills:grilling"],
    });
    expect(provider(rebuilt, "skills").decisions[0]).toEqual(
      expect.objectContaining({ kind: "change", item: "grilling", reason: "--rebuild" }),
    );
  });

  it("asks before replacing an edited folder or one the CLI did not install, and honors answers", () => {
    const touched = state([
      installed("grilling", "mattpocock/skills", TIP, { folder: EDITED }),
      {
        provider: "skills",
        fact: "skill",
        name: "grill-me",
        path: "/Users/connor/.agents/skills/grill-me",
      },
    ]);
    const asked = provider(plan({ config: withSkills, resolved: tips, state: touched }), "skills");
    expect(
      asked.decisions
        .slice(0, 2)
        .map((d) =>
          d.kind === "ask"
            ? [d.question.kind, d.question.subject, d.question.problem, d.question.default]
            : d.kind,
        ),
    ).toEqual([
      ["skill", "skills:grilling", "was edited there", "skip"],
      ["skill", "skills:grill-me", "was not installed by the skills CLI", "skip"],
    ]);
    const answered = provider(
      plan({
        config: withSkills,
        resolved: tips,
        state: touched,
        answers: { "skill:skills:grilling": "overwrite", "skill:skills:grill-me": "skip" },
      }),
      "skills",
    );
    expect(answered.decisions.slice(0, 2)).toEqual([
      expect.objectContaining({ kind: "change", item: "grilling", reason: "was edited there" }),
      { kind: "skip", item: "grill-me", reason: "was not installed by the skills CLI" },
    ]);
  });

  it("skips an installed skill whose source cannot be checked, still installing a missing one", () => {
    const unreachable = {
      ...tips,
      skills: { "vercel-labs/skills#v2": { error: "GitHub answered 503" } },
    };
    const result = plan({ config: withSkills, resolved: unreachable, state: state(current) });
    expect(provider(result, "skills").decisions[2]).toEqual({
      kind: "skip",
      item: "find-skills",
      at: at(TIP),
      reason: "could not check vercel-labs/skills: GitHub answered 503",
    });
    const missing = plan({ config: withSkills, resolved: unreachable, state: state([]) });
    expect(provider(missing, "skills").decisions[2]).toEqual(
      expect.objectContaining({ kind: "change", item: "find-skills", to: "v2" }),
    );
  });

  it("reinstalls for a changed ref, a new agent, or no Install Record, never for a dropped agent", () => {
    const result = plan({
      config: withSkills,
      resolved: tips,
      state: state(
        [
          installed("grilling", "mattpocock/skills", TIP, { ref: "main" }),
          installed("grill-me", "mattpocock/skills", TIP),
          installed("find-skills", "vercel-labs/skills", TIP, {
            ref: "v2",
            folderOf: "skills/find-skills",
          }),
          current[3],
        ],
        [
          ...shipped(["grilling"]),
          ...shipped(["grill-me"], ["claude-code"]),
          // Installed for codex too once; the config now names only claude-code.
          ...shipped(["find-skills"]),
        ],
      ),
    });
    expect(provider(result, "skills").decisions).toEqual([
      expect.objectContaining({ kind: "change", item: "grilling", reason: "installed at main" }),
      expect.objectContaining({
        kind: "change",
        item: "grill-me",
        reason: "not installed for codex",
      }),
      { kind: "leave", item: "find-skills", at: at(TIP) },
      expect.objectContaining({ kind: "change", item: "local", reason: "not installed by a Ship" }),
    ]);
  });

  it("fails every skill without the CLI, or for an agent id the CLI does not know", () => {
    const unknown = plan({
      config: withSkills,
      resolved: tips,
      state: state([
        { provider: "skills", fact: "error", error: "Invalid agents: codex" },
        ...current,
      ]),
    });
    expect(provider(unknown, "skills").decisions[0]).toEqual({
      kind: "fail",
      item: "grilling",
      at: at(TIP),
      reason: "Invalid agents: codex",
    });
    // vp lists the CLI, so this Ship installs it and the skills wait for the next.
    const noCli = facts({ skills: [{ provider: "skills", fact: "cli", present: false }] });
    expect(
      provider(plan({ config: withSkills, resolved: tips, state: noCli }), "skills").decisions[0],
    ).toEqual({
      kind: "skip",
      item: "grilling",
      reason: "waits for the skills CLI this Ship installs; ship again",
    });
    const withoutCli = decode({
      ...written,
      vp: { items: { vercel: "^59.25.4" } },
      skills: { agents: ["codex"], items: { grilling: "mattpocock/skills" } },
    });
    expect(
      provider(plan({ config: withoutCli, resolved: tips, state: noCli }), "skills").decisions[0],
    ).toEqual({
      kind: "fail",
      item: "grilling",
      reason: "the skills CLI is not installed; list skills in the items of vp, npm, bun, or pnpm",
    });
  });
});
