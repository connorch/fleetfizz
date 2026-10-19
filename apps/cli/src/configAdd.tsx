// `fizz config add <section> ...`: one Item into the config, written as the
// docs write it (the shorthand when it has no Targeting), then validated and
// saved (ADR 0017). Missing values are asked for at a terminal; without one
// they are an error. An Item already in the config is an error too: changing
// one is `fizz config edit`.
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Prompt } from "effect/cli";

import {
  addedRange,
  configPath,
  type FleetConfig,
  insertAt,
  type JsonPath,
  parseConfig,
  type Platform,
  type ProviderName,
  saveConfig,
} from "@fleetfizz/config";
import { address, targets, type Targeting } from "@fleetfizz/core";
import { readTailnet, resolveVersions, type Tailnet } from "@fleetfizz/remote";

import { changeText } from "./configView.tsx";
import { expandHome, homeRelative, interactive, runLocal } from "./local.ts";
import { T } from "./view.tsx";

// A problem with what was asked for. Printed as one line.
export class ConfigAddError extends Schema.TaggedError<ConfigAddError>()("ConfigAddError", {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

export interface TargetingFlags {
  readonly platforms: ReadonlyArray<Platform>;
  readonly machines: ReadonlyArray<string>;
}

// The Targeting fields to write: only those given.
export const targetingOf = (flags: TargetingFlags): Targeting => ({
  ...(flags.platforms.length > 0 ? { platforms: [...new Set(flags.platforms)] } : {}),
  ...(flags.machines.length > 0 ? { machines: [...new Set(flags.machines)] } : {}),
});

const untargeted = (targeting: Targeting) =>
  targeting.platforms === undefined && targeting.machines === undefined;

// A Global, Formula, or Cask: its Range, or `{ range, ... }` with Targeting.
export const rangeEntry = (range: string, targeting: Targeting) =>
  untargeted(targeting) ? range : { range, ...targeting };

// A Shared File: its path, or `{ path, exclude, ... }`.
export const fileEntry = (path: string, exclude: ReadonlyArray<string>, targeting: Targeting) =>
  untargeted(targeting) && exclude.length === 0
    ? path
    : { path, ...(exclude.length > 0 ? { exclude } : {}), ...targeting };

// `pkg`, `pkg@range`, `@scope/pkg`, or `@scope/pkg@range`.
export const parseSpec = (spec: string): { readonly name: string; readonly range?: string } => {
  const at = spec.lastIndexOf("@");
  return at > 0 ? { name: spec.slice(0, at), range: spec.slice(at + 1) } : { name: spec };
};

// A Shared File's default name: its last path segment without a leading dot,
// in the letters a name may use (`~/.gitconfig` is `gitconfig`).
export const fileName = (path: string): string =>
  (path.replace(/\/+$/, "").split("/").at(-1) ?? "")
    .replace(/^\.+/, "")
    .replace(/[^A-Za-z0-9._-]/g, "-");

// The config file, as text and as loaded.
export const openConfig = Effect.fn("openConfig")(function* (flag: string | undefined) {
  const path = flag ?? configPath(process.env);
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(path))) {
    return yield* new ConfigAddError({
      reason: `no config at ${homeRelative(path)}; run fizz init to write one, or pass --config`,
    });
  }
  const text = yield* fs.readFileString(path);
  return { path, text, config: yield* parseConfig(path, text) };
});

// The Machines an Item reaches: its section's Targeting and its own, against
// each Machine's Platform on the tailnet.
const reach = (config: FleetConfig, tailnet: Tailnet, provider: ProviderName, own: Targeting) => {
  const section = config[provider] ?? {};
  const names = config.machines.filter((name) => {
    const machine = tailnet.fleet.find((m) => m.name === name);
    return machine !== undefined && targets(section, machine) && targets(own, machine);
  });
  return names.length === config.machines.length
    ? "every Machine"
    : names.length === 0
      ? undefined
      : names.join(", ");
};

// Writes one Item and prints the lines it changed.
const addItem = Effect.fn("addItem")(function* (input: {
  readonly config: string | undefined;
  readonly provider: ProviderName;
  readonly name: string;
  readonly entry: unknown;
  readonly targeting: Targeting;
  readonly notes?: ReadonlyArray<string>;
}) {
  const { path, text, config } = yield* openConfig(input.config);
  const where = address(input.provider, input.name);
  if (config[input.provider]?.items?.[input.name] !== undefined) {
    return yield* new ConfigAddError({
      reason: `${where} is already in the config; change it with fizz config edit`,
    });
  }
  const unknown = (input.targeting.machines ?? []).filter((m) => !config.machines.includes(m));
  if (unknown.length > 0) {
    return yield* new ConfigAddError({
      reason: `not in machines: ${unknown.join(", ")} (add it with fizz config add machines)`,
    });
  }
  const tailnet = yield* readTailnet();
  // A Cask fails on Linux, so with a Linux Machine in the Fleet the cask
  // section targets darwin, unless it already says where it goes.
  const linux = config.machines.some(
    (m) => tailnet.fleet.find((f) => f.name === m)?.platform === "linux",
  );
  const start =
    input.provider === "cask" && linux && config.cask?.platforms === undefined
      ? insertAt(text, ["cask", "platforms"], ["darwin"])
      : { text };
  if ("reason" in start) return yield* new ConfigAddError({ reason: start.reason });
  const at: JsonPath = [input.provider, "items", input.name];
  const result = insertAt(start.text, at, input.entry);
  if ("reason" in result) return yield* new ConfigAddError({ reason: result.reason });
  const saved = yield* saveConfig(path, result.text);
  const to = reach(saved, tailnet, input.provider, input.targeting);
  yield* Console.log(
    changeText(
      path,
      text,
      result.text,
      <>
        <T tone="ok">added</T>
        {` ${where}`}
        {to === undefined ? (
          <T tone="skip">{" · no Machine in the Fleet matches its Targeting yet"}</T>
        ) : (
          <>
            {` for ${to}`}
            <T tone="dim">{" · fizz ship to install it"}</T>
          </>
        )}
      </>,
    ),
  );
  for (const note of input.notes ?? []) yield* Console.log(note);
});

const needs = (what: string) =>
  new ConfigAddError({ reason: `${what} is needed (no terminal to ask at)` });

// `fizz config add vp <pkg>[@range]`.
export const addGlobal = Effect.fn("addGlobal")(function* (input: {
  readonly config: string | undefined;
  readonly spec: string;
  readonly targeting: TargetingFlags;
}) {
  const { name, range: given } = parseSpec(input.spec);
  const range =
    given ??
    (yield* Effect.gen(function* () {
      const listed = yield* runLocal("vp", ["list", "--global", "--json"]);
      const installed = Schema.decodeOption(
        Schema.fromJsonString(
          Schema.Array(Schema.Struct({ name: Schema.String, version: Schema.String })),
        ),
      )(listed.stdout);
      const here =
        installed._tag === "Some"
          ? installed.value.find((g) => g.name === name)?.version
          : undefined;
      const published = here === undefined ? ((yield* resolveVersions([name]))[name] ?? []) : [];
      const range = addedRange(here, published);
      if (range === undefined)
        return yield* new ConfigAddError({
          reason: `${name} is not installed here and npm has no version of it; check the name, or give a Range (${name}@^1.0.0)`,
        });
      return range;
    }));
  const targeting = targetingOf(input.targeting);
  yield* addItem({
    config: input.config,
    provider: "vp",
    name,
    entry: rangeEntry(range, targeting),
    targeting,
  });
});

// `fizz config add brew|cask <name>`. The name is checked with `brew info`
// when Homebrew is here; a tapped name (`owner/tap/name`) is not, since
// checking it would tap it.
export const addHomebrew = Effect.fn("addHomebrew")(function* (input: {
  readonly config: string | undefined;
  readonly provider: "brew" | "cask";
  readonly name: string;
  readonly latest: boolean;
  readonly targeting: TargetingFlags;
}) {
  const noun = input.provider === "brew" ? "Formula" : "Cask";
  if (input.provider === "cask" && input.targeting.platforms.includes("linux"))
    return yield* new ConfigAddError({
      reason: "a Cask is macOS only; leave out --platform linux",
    });
  const notes: string[] = [];
  if (input.name.includes("/")) notes.push(`${input.name} is a tapped name, so it was not checked`);
  else {
    const info = yield* runLocal("brew", [
      "info",
      input.provider === "brew" ? "--formula" : "--cask",
      input.name,
    ]);
    if (info.code === 127)
      notes.push(`Homebrew is not installed here, so ${input.name} was not checked`);
    else if (info.code !== 0)
      return yield* new ConfigAddError({ reason: `Homebrew has no ${noun} named ${input.name}` });
  }
  const targeting = targetingOf(input.targeting);
  yield* addItem({
    config: input.config,
    provider: input.provider,
    name: input.name,
    entry: rangeEntry(input.latest ? "latest" : "*", targeting),
    targeting,
    notes,
  });
});

// The origin's default branch: from GitHub without credentials, then through
// gh for a private repo, else undefined.
const defaultBranch = Effect.fn("defaultBranch")(function* (origin: string) {
  const remote = yield* runLocal(
    "git",
    ["ls-remote", "--symref", `https://github.com/${origin}`, "HEAD"],
    { GIT_TERMINAL_PROMPT: "0" },
  );
  const head = /^ref: refs\/heads\/(\S+)\s+HEAD/m.exec(remote.stdout)?.[1];
  if (head !== undefined) return head;
  const gh = yield* runLocal("gh", [
    "repo",
    "view",
    origin,
    "--json",
    "defaultBranchRef",
    "--jq",
    ".defaultBranchRef.name",
  ]);
  return gh.code === 0 && gh.stdout.trim() !== "" ? gh.stdout.trim() : undefined;
});

// `fizz config add repos <owner/repo>`.
export const addRepo = Effect.fn("addRepo")(function* (input: {
  readonly config: string | undefined;
  readonly origin: string;
  readonly name: string | undefined;
  readonly ref: string | undefined;
  readonly install: string | undefined;
  readonly outputs: ReadonlyArray<string>;
  readonly targeting: TargetingFlags;
}) {
  const name = input.name ?? input.origin.split("/").at(-1) ?? input.origin;
  const ask = interactive();
  const found = input.ref === undefined ? yield* defaultBranch(input.origin) : undefined;
  const ref =
    input.ref ??
    (ask
      ? yield* Prompt.String({
          message: "Ref",
          ...(found === undefined ? {} : { default: found }),
          validate: (v) =>
            v.trim() === "" ? Effect.fail("a Ref is needed") : Effect.succeed(v.trim()),
        })
      : (found ??
        (yield* new ConfigAddError({
          reason: `could not find ${input.origin}'s default branch; pass --ref`,
        }))));
  const install =
    input.install ??
    (ask
      ? yield* Prompt.String({
          message: "Install Command (runs in the Managed Clone)",
          validate: (v) =>
            v.trim() === ""
              ? Effect.fail("an Install Command is needed")
              : Effect.succeed(v.trim()),
        })
      : yield* needs("--install"));
  const outputs = (
    input.outputs.length > 0 || input.install !== undefined || !ask
      ? input.outputs
      : (yield* Prompt.String({
          message: "Outputs (paths outside the clone it produces, comma-separated, optional)",
          default: "",
        }))
          .split(",")
          .map((o) => o.trim())
          .filter((o) => o !== "")
  ).map(homeRelative); // `~/x`, as the shell expands it, names each Machine's home.
  const targeting = targetingOf(input.targeting);
  yield* addItem({
    config: input.config,
    provider: "repos",
    name,
    entry: {
      origin: input.origin,
      ref,
      install,
      ...(outputs.length > 0 ? { outputs } : {}),
      ...targeting,
    },
    targeting,
  });
});

// `fizz config add files <path>`. A Ship copies it from the Starting
// Machine, so it must exist here; it is written under `~` when it is under
// $HOME, so it names the same place on every Machine.
export const addFile = Effect.fn("addFile")(function* (input: {
  readonly config: string | undefined;
  readonly path: string;
  readonly name: string | undefined;
  readonly exclude: ReadonlyArray<string>;
  readonly targeting: TargetingFlags;
}) {
  const fs = yield* FileSystem.FileSystem;
  const paths = yield* Path.Path;
  const local = paths.resolve(expandHome(input.path));
  if (!(yield* fs.exists(local)))
    return yield* new ConfigAddError({
      reason: `${input.path} does not exist here; a Ship copies it from this Machine`,
    });
  const path = homeRelative(local);
  const name = input.name ?? fileName(path);
  const targeting = targetingOf(input.targeting);
  yield* addItem({
    config: input.config,
    provider: "files",
    name,
    entry: fileEntry(path, input.exclude, targeting),
    targeting,
  });
});

// `fizz config add machines [name...]`. Without names, a terminal picks from
// the tailnet's Machines the config does not list yet.
export const addMachines = Effect.fn("addMachines")(function* (input: {
  readonly config: string | undefined;
  readonly names: ReadonlyArray<string>;
}) {
  const { path, text, config } = yield* openConfig(input.config);
  const tailnet = yield* readTailnet();
  const listed = new Set(config.machines);
  const candidates = tailnet.fleet.filter((m) => !listed.has(m.name));
  const names =
    input.names.length > 0
      ? input.names
      : !interactive()
        ? yield* needs("a Machine name")
        : candidates.length === 0
          ? yield* new ConfigAddError({
              reason: "every macOS and linux Machine on the tailnet is already listed",
            })
          : yield* Prompt.MultiSelect({
              message: "Which Machines?",
              choices: candidates.map((m) => {
                const note = machineNote(m, tailnet);
                return {
                  title: `${m.name}  ${m.platform}`,
                  value: m.name,
                  ...(note === undefined ? {} : { description: note }),
                };
              }),
              min: 1,
            });
  const again = names.filter((n) => listed.has(n));
  if (again.length > 0)
    return yield* new ConfigAddError({ reason: `already in machines: ${again.join(", ")}` });
  const unknown = names.filter((n) => !tailnet.fleet.some((m) => m.name === n));
  if (unknown.length > 0)
    return yield* new ConfigAddError({
      reason: `not a macOS or linux Machine on the tailnet: ${unknown.join(", ")} (it has: ${tailnet.fleet.map((m) => m.name).join(", ")})`,
    });
  let next = text;
  for (const [i, name] of names.entries()) {
    const result = insertAt(next, ["machines", config.machines.length + i], name);
    if ("reason" in result) return yield* new ConfigAddError({ reason: result.reason });
    next = result.text;
  }
  yield* saveConfig(path, next);
  const notes = names.flatMap((n) => {
    const m = tailnet.fleet.find((f) => f.name === n);
    const note = m === undefined ? undefined : machineNote(m, tailnet);
    return note === undefined ? [] : [`${n}: ${note}`];
  });
  yield* Console.log(
    changeText(
      path,
      text,
      next,
      <>
        <T tone="ok">added</T>
        {` ${names.join(", ")} to the Fleet`}
        <T tone="dim">{" · fizz ship to set it up"}</T>
      </>,
    ),
  );
  for (const note of notes) yield* Console.log(note);
});

// Why a Ship cannot reach a Machine yet, if it cannot. This Machine always
// can: a Ship runs its scripts locally.
export const machineNote = (m: Tailnet["fleet"][number], tailnet: Tailnet): string | undefined =>
  m.name === tailnet.self.name
    ? undefined
    : !m.online
      ? "offline; a Ship skips it until it is online"
      : !m.ssh
        ? "Tailscale SSH is off there: run sudo tailscale set --ssh on it"
        : undefined;
