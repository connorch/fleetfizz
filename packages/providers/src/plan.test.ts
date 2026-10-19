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

import { PROVIDERS } from "./index.ts";

// A config as written, decoded as the CLI decodes it.
const decode = Schema.decodeSync(FleetConfig);

const written: typeof FleetConfig.Encoded = {
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
  vp: {
    version: "1.1.0",
    node: "24.18.1",
    items: { vercel: "^59.25.4", "inngest-cli": "^1.45.1", skills: "^1.7.0" },
  },
};
const config = decode(written);

const SKILLS_HEAD = "abc1234000000000000000000000000000000000";
const SKILLS_TIP = "def5678000000000000000000000000000000000";

const versions = {
  "vite-plus": ["1.0.0", "1.1.0"],
  node: ["24.18.1", "24.19.0"],
  vercel: ["58.0.0", "59.25.4", "59.30.0", "60.1.0"],
  "inngest-cli": ["1.45.1"],
  skills: ["1.5.7", "1.7.0"],
};

const resolved: PlanInput["resolved"] = {
  vp: versions,
  repos: { "connorch/skills#main": { commit: SKILLS_TIP } },
};

const MACBOOK: MachineIdentity = { name: "connors-macbook-pro", platform: "darwin" };
const ROOT = "/Users/connor/.local/share/fleetfizz/clones";

type Global = { name: string; version: string; platform?: { node?: string } };

// A MacBook Pro before its first Ship: old vp, old Globals, nothing cloned.
const facts = (over: {
  vp?: { version: string; path: string } | null;
  mode?: "managed" | "system-first";
  globals?: ReadonlyArray<Global>;
  rootPresent?: boolean;
  rootPath?: string;
  repos?: ReadonlyArray<unknown>;
  records?: ReadonlyArray<unknown>;
  homebrew?: ReadonlyArray<unknown>;
}) => {
  const vp =
    over.vp === undefined
      ? { version: "1.0.0-rc.0", path: "/Users/connor/.vite-plus/bin/vp" }
      : over.vp;
  return assembleState([
    { fact: "home", path: "/Users/connor" },
    ...(vp === null
      ? [{ provider: "vp", fact: "vp", version: null }]
      : [
          { provider: "vp", fact: "vp", ...vp },
          { provider: "vp", fact: "mode", mode: over.mode ?? "managed" },
          { provider: "vp", fact: "default", tool: "node", version: "24.18.1" },
          { provider: "vp", fact: "default", tool: "pnpm", version: "10.0.0" },
          {
            provider: "vp",
            fact: "globals",
            list: over.globals ?? [
              { name: "vercel", version: "58.0.0", platform: { node: "24.18.1" } },
              { name: "skills", version: "1.7.0", platform: { node: "22.0.0" } },
            ],
          },
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
    { fact: "end" },
  ]);
};

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
      self: "0.2.0",
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

describe("the vp Provider", () => {
  it("brings the vp section into line", () => {
    const vp = provider(plan({}), "vp");
    expect(vp.decisions).toEqual([
      expect.objectContaining({ kind: "change", item: "vp", from: "1.0.0-rc.0", to: "1.1.0" }),
      { kind: "leave", item: "mode", at: "managed" },
      { kind: "leave", item: "node", at: "24.18.1" },
      expect.objectContaining({ kind: "change", item: "vercel", from: "58.0.0", to: "59.30.0" }),
      expect.objectContaining({ kind: "change", item: "inngest-cli", to: "1.45.1" }),
      expect.objectContaining({
        kind: "change",
        item: "skills",
        reason: "Node 22.0.0 → 24.18.1",
      }),
      expect.objectContaining({ kind: "change", item: "fleetfizz", to: "0.2.0" }),
    ]);
    expect(vp.steps.map((s) => [s.id, s.items])).toEqual([
      ["vp:vp:upgrade", ["vp"]],
      ["vp:skills:reinstall", ["skills"]],
      ["vp:globals:install", ["vercel", "inngest-cli", "fleetfizz"]],
    ]);
    expect(vp.steps[2]?.run).toEqual([
      "( command vp install -g 'vercel@59.30.0' 'inngest-cli@1.45.1' 'fleetfizz@0.2.0' )",
    ]);
  });

  it("pins fleetfizz to the running version, and refuses to downgrade a newer one", () => {
    const self = (version: string) =>
      provider(
        plan({
          state: facts({
            globals: [{ name: "fleetfizz", version, platform: { node: "24.18.1" } }],
          }),
        }),
        "vp",
      ).decisions.find((d) => d.item === "fleetfizz");
    expect(self("0.1.0")).toMatchObject({ kind: "change", from: "0.1.0", to: "0.2.0" });
    expect(self("0.2.0")).toEqual({ kind: "leave", item: "fleetfizz", at: "0.2.0" });
    expect(self("0.3.0")).toMatchObject({
      kind: "fail",
      reason: expect.stringContaining("upgrade here first"),
    });
  });

  it("bootstraps vp on a bare Machine in one step, then plans the whole section", () => {
    const result = plan({ state: facts({ vp: null }) });
    const vp = provider(result, "vp");
    expect(vp.steps.map((s) => s.id)).toEqual([
      "vp:vp:install",
      "vp:mode:on",
      "vp:node:default",
      "vp:globals:install",
    ]);
    // In the main shell, so the PATH change reaches later steps.
    expect(vp.steps[0]?.run[0]).toMatch(
      /^curl -fsSL https:\/\/vite\.plus \| bash && .* && command vp upgrade '1\.1\.0'$/,
    );
    expect(vp.steps[3]?.items).toEqual(["vercel", "inngest-cli", "skills", "fleetfizz"]);
  });

  it("keeps package managers' defaults, with Yarn 2 and newer from @yarnpkg/cli-dist", () => {
    const vp = provider(
      plan({
        config: { ...config, vp: { ...config.vp, pnpm: "^10.2.0", yarn: "^4" } },
        resolved: {
          ...resolved,
          vp: {
            ...versions,
            pnpm: ["10.0.0", "10.2.0"],
            yarn: ["1.22.22"],
            "@yarnpkg/cli-dist": ["4.18.1"],
          },
        },
      }),
      "vp",
    );
    expect(vp.decisions.filter((d) => d.item === "pnpm" || d.item === "yarn")).toEqual([
      expect.objectContaining({ kind: "change", item: "pnpm", from: "10.0.0", to: "10.2.0" }),
      expect.objectContaining({ kind: "change", item: "yarn", to: "4.18.1" }),
    ]);
    expect(vp.steps.filter((s) => s.id.endsWith(":default")).map((s) => s.run)).toEqual([
      ["( command vp env default 'pnpm@10.2.0' )"],
      ["( command vp env default 'yarn@4.18.1' )"],
    ]);
  });

  it("asks to switch a system-first Machine to managed mode, skipping by default", () => {
    const vp = (answers?: Readonly<Record<string, string>>) =>
      provider(
        plan({
          state: facts({ mode: "system-first" }),
          ...(answers === undefined ? {} : { answers }),
        }),
        "vp",
      );
    const asked = vp();
    expect(asked.decisions.find((d) => d.item === "mode")).toMatchObject({
      kind: "ask",
      question: { kind: "mode", subject: "vp:mode", found: "system-first", default: "skip" },
    });
    expect(asked.decisions.find((d) => d.item === "node")).toMatchObject({
      kind: "skip",
      reason: "needs managed mode",
    });
    // The rest of the section still ships.
    expect(asked.steps.map((s) => s.id)).toContain("vp:globals:install");
    expect(vp({ "mode:vp:mode": "skip" }).decisions.find((d) => d.item === "mode")).toEqual({
      kind: "skip",
      item: "mode",
      at: "system-first",
      reason: "needs managed mode",
    });
    const managed = vp({ "mode:vp:mode": "managed" });
    expect(managed.decisions.find((d) => d.item === "node")).toMatchObject({ kind: "leave" });
    expect(managed.steps.map((s) => [s.id, s.run])).toContainEqual([
      "vp:mode:on",
      ["( command vp env on )"],
    ]);
  });

  it("bootstraps vp without the registry when any version will do", () => {
    const vp = provider(
      plan({
        state: facts({ vp: null }),
        config: decode({ machines: written.machines }),
        resolved: { vp: {}, repos: {} },
      }),
      "vp",
    );
    expect(vp.decisions[0]).toMatchObject({ kind: "change", item: "vp", to: "latest" });
    expect(vp.steps[0]?.run[0]).not.toContain("vp upgrade");
  });

  it("asks about a Global above its Range, and honors answers", () => {
    const state = facts({
      globals: [{ name: "vercel", version: "60.1.0", platform: { node: "24.18.1" } }],
    });
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

  it("fails a Homebrew vp instead of running vp upgrade, holding back repos", () => {
    const result = plan({
      state: facts({ vp: { version: "1.0.0", path: "/opt/homebrew/bin/vp" } }),
    });
    expect(provider(result, "vp").decisions[0]).toMatchObject({
      kind: "fail",
      reason: expect.stringContaining("brew upgrade vite-plus"),
    });
    const repos = provider(result, "repos");
    expect(repos.steps).toEqual([]);
    expect(repos.decisions.map((d) => [d.kind, d.kind === "skip" ? d.reason : undefined])).toEqual([
      ["skip", "depends on vp"],
      ["skip", "depends on vp"],
    ]);
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
    const state = facts({
      globals: [{ name: "vercel", version: "60.1.0", platform: { node: "24.18.1" } }],
    });
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
    // Shared Files and packages come before repos, so an Install Command can use them.
    expect(result.providers.map((p) => p.name)).toEqual(["files", "vp", "brew", "cask", "repos"]);
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
