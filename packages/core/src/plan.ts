// Plan: pure. Config plus checked state gives one Machine's Steps, the
// Questions it raises, and the failures already known before Apply.
import * as semver from "semver";

import {
  DEFAULT_CLONE_ROOT,
  isPin,
  repoName,
  SELF_PACKAGE,
  type FleetConfig,
} from "@fleetfizz/config";

import { decideRange } from "./range.ts";
import { decideInstall, type InstallDecision } from "./record.ts";
import type { MachineState } from "./state.ts";
import { targets, type MachineIdentity } from "./targeting.ts";

// Registry package names for the toolchain itself.
export const VP_PACKAGE = "vite-plus";
export const NODE_PACKAGE = "node";

export type Rebuild = "none" | "all" | ReadonlyArray<string>;

// How a Question was answered in advance (--bump edits the config instead).
export type Answer = "skip" | "downgrade";

export interface PlanInput {
  readonly config: FleetConfig;
  readonly machine: MachineIdentity;
  readonly state: MachineState;
  // The running fleetfizz version, which every Machine is pinned to (ADR 0008).
  readonly self: string;
  // Published versions per package, resolved once on the Starting Machine.
  readonly versions: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly rebuild: Rebuild;
  readonly answers: Readonly<Record<string, Answer>>;
}

export type VpStep =
  // vp's installer on a Machine without vp; always the first step.
  | { readonly kind: "bootstrap" }
  | { readonly kind: "vp"; readonly from: string | null; readonly version: string }
  | { readonly kind: "node"; readonly from: string | null; readonly version: string }
  // A Global installed on a different Node than the default, reinstalled as is.
  | { readonly kind: "reinstall"; readonly name: string; readonly version: string }
  | {
      readonly kind: "globals";
      readonly packages: ReadonlyArray<{
        readonly name: string;
        readonly from?: string;
        readonly version: string;
      }>;
    };

export interface RepoStep {
  readonly name: string;
  readonly origin: string;
  readonly ref: string;
  readonly pin: boolean;
  // Managed Clone path with "~" unexpanded; `expanded` is the absolute path.
  readonly path: string;
  readonly expanded: string;
  readonly head?: string;
  readonly install: string;
  readonly files: Readonly<Record<string, string>>;
  readonly outputs: ReadonlyArray<string>;
  readonly decision: InstallDecision;
}

// A Global (or vp, or Node) above its Range on this Machine.
export interface Question {
  readonly machine: string;
  readonly package: string;
  readonly installed: string;
  readonly range: string;
}

export interface Skipped {
  readonly what: string;
  readonly reason: string;
}

export interface Failure {
  readonly what: string;
  readonly reason: string;
}

// A Failure and the plan section it came from: a Tracked Repo and a Global
// may share a name.
export interface PlannedFailure extends Failure {
  readonly section: "vp" | "repos";
}

export interface MachinePlan {
  readonly machine: MachineIdentity;
  readonly vp: ReadonlyArray<VpStep>;
  readonly repos: ReadonlyArray<RepoStep>;
  readonly questions: ReadonlyArray<Question>;
  readonly skipped: ReadonlyArray<Skipped>;
  readonly failures: ReadonlyArray<PlannedFailure>;
}

export const expandHome = (path: string, home: string): string =>
  path === "~" ? home : path.startsWith("~/") ? `${home}${path.slice(1)}` : path;

const isHomebrew = (path: string | undefined) =>
  path !== undefined && (path.includes("/homebrew/") || path.includes("/Cellar/"));

interface Section {
  readonly steps: VpStep[];
  readonly questions: Question[];
  readonly skipped: Skipped[];
  readonly failures: Failure[];
}

// The vp section, plus two things every Machine in the Fleet gets whether or
// not the section targets it: vp itself (bootstrapped when missing) and this
// fleetfizz version as a Global.
const planVp = (input: PlanInput): Section => {
  const out: Section = { steps: [], questions: [], skipped: [], failures: [] };
  const { state, machine } = input;
  const vp = input.config.vp;
  const targeted = vp !== undefined && targets(vp, machine);

  const missing = state.vp === undefined || state.vp.version === null;
  if (missing) out.steps.push({ kind: "bootstrap" });
  const installed = missing ? undefined : (state.vp?.version ?? undefined);

  // Decides one Range; returns the version to install, or undefined.
  const decide = (
    pkg: string,
    range: string | undefined,
    current: string | undefined,
    shown: string = pkg,
  ): string | undefined => {
    if (range === undefined) return undefined;
    const decision = decideRange(range, current, input.versions[pkg] ?? []);
    switch (decision.kind) {
      case "leave":
        return undefined;
      case "install":
        return decision.version;
      case "unavailable":
        out.failures.push({ what: shown, reason: `no published version satisfies ${range}` });
        return undefined;
      case "ask": {
        const answer = input.answers[pkg];
        if (answer === "downgrade") {
          const target = decideRange(range, undefined, input.versions[pkg] ?? []);
          if (target.kind === "install") return target.version;
          out.failures.push({ what: shown, reason: `no published version satisfies ${range}` });
          return undefined;
        }
        if (answer === "skip") {
          out.skipped.push({ what: shown, reason: `${decision.installed} is above ${range}` });
          return undefined;
        }
        out.questions.push({
          machine: machine.name,
          package: pkg,
          installed: decision.installed,
          range,
        });
        return undefined;
      }
    }
  };

  const nodeNow = missing ? undefined : (state.node ?? undefined);
  let nodeTarget: string | undefined;
  if (targeted) {
    const vpTarget = decide(VP_PACKAGE, vp.version, installed, "vp");
    if (vpTarget !== undefined) {
      if (isHomebrew(state.vp?.path)) {
        out.failures.push({
          what: "vp",
          reason: `vp ${installed} was installed with Homebrew; run brew upgrade vite-plus to get ${vpTarget}`,
        });
      } else {
        out.steps.push({ kind: "vp", from: installed ?? null, version: vpTarget });
      }
    }
    nodeTarget = decide(NODE_PACKAGE, vp.node, nodeNow, "node");
    if (nodeTarget !== undefined)
      out.steps.push({ kind: "node", from: nodeNow ?? null, version: nodeTarget });
  }
  const nodeDefault = nodeTarget ?? nodeNow;

  const byName = new Map((missing ? [] : state.globals).map((g) => [g.name, g]));
  const installs: Array<{ name: string; from?: string; version: string }> = [];
  const wanted = Object.entries(targeted ? (vp.globals ?? {}) : {});
  for (const [name, range] of [...wanted, [SELF_PACKAGE, input.self] as const]) {
    const current = byName.get(name);
    const version =
      name === SELF_PACKAGE
        ? decideSelf(current?.version, input.self, out)
        : decide(name, range, current?.version);
    if (version !== undefined) {
      installs.push(
        current === undefined ? { name, version } : { name, from: current.version, version },
      );
    } else if (
      current !== undefined &&
      nodeDefault !== undefined &&
      current.platform?.node !== undefined &&
      current.platform.node !== nodeDefault
    ) {
      out.steps.push({ kind: "reinstall", name, version: current.version });
    }
  }
  if (installs.length > 0) out.steps.push({ kind: "globals", packages: installs });
  return out;
};

// fleetfizz is pinned to the running version. A Machine running a newer one
// is not downgraded: someone shipped from there, so this Machine is behind.
const decideSelf = (
  installed: string | undefined,
  self: string,
  out: Section,
): string | undefined => {
  if (installed === undefined || semver.lt(installed, self)) return self;
  if (semver.gt(installed, self)) {
    out.failures.push({
      what: SELF_PACKAGE,
      reason: `runs ${SELF_PACKAGE} ${installed}, newer than this ${self}; upgrade here first`,
    });
  }
  return undefined;
};

const planRepos = (input: PlanInput): { repos: RepoStep[]; failures: Failure[] } => {
  const repos: RepoStep[] = [];
  const failures: Failure[] = [];
  const { config, machine, state } = input;
  const home = state.home ?? "~";
  const root = config.machines?.[machine.name]?.clones ?? DEFAULT_CLONE_ROOT;
  for (const repo of config.repos ?? []) {
    if (!targets(repo, machine)) continue;
    const name = repoName(repo);
    // A Clone Root under ~ is created on demand; any other missing root means a
    // volume is not mounted, and fleetfizz never falls back to the internal drive.
    if (state.cloneRoot !== undefined && !state.cloneRoot.present && !root.startsWith("~")) {
      failures.push({ what: name, reason: `clone root not mounted: ${state.cloneRoot.path}` });
      continue;
    }
    const current = state.repos[name];
    const expectedOrigin = `https://github.com/${repo.origin}.git`;
    if (current?.present && current.origin !== undefined && current.origin !== expectedOrigin) {
      failures.push({
        what: name,
        reason: `managed clone has origin ${current.origin}, expected ${expectedOrigin}`,
      });
      continue;
    }
    const path = `${root}/${name}`;
    const expanded = expandHome(path, home);
    const files = repo.files ?? {};
    const outputs = repo.outputs ?? [];
    const rebuild =
      input.rebuild === "all" || (input.rebuild !== "none" && input.rebuild.includes(name));
    // Before Apply the commit is the current HEAD (undefined when not cloned
    // yet); the fetch may move it, which the Apply script re-checks.
    const decision = decideInstall(
      state.records[name],
      {
        commit: current?.head ?? "",
        path: expanded,
        install: repo.install,
        files,
        outputs: Object.fromEntries(outputs.map((o) => [o, state.outputs[name]?.[o] ?? undefined])),
      },
      rebuild,
    );
    repos.push({
      name,
      origin: repo.origin,
      ref: repo.ref,
      pin: isPin(repo.ref),
      path,
      expanded,
      ...(current?.head === undefined ? {} : { head: current.head }),
      install: repo.install,
      files,
      outputs,
      decision,
    });
  }
  return { repos, failures };
};

export const plan = (input: PlanInput): MachinePlan => {
  const vp = planVp(input);
  const repos = planRepos(input);
  return {
    machine: input.machine,
    vp: vp.steps,
    repos: repos.repos,
    questions: vp.questions,
    skipped: vp.skipped,
    failures: [
      ...vp.failures.map((f) => ({ ...f, section: "vp" as const })),
      ...repos.failures.map((f) => ({ ...f, section: "repos" as const })),
    ],
  };
};
