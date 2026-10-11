// One-line summaries of a MachinePlan for PLAN lines.
import type { MachinePlan, RepoStep, VpStep } from "@fleetfizz/core";

const SEP = " · ";

const vpPart = (step: VpStep): string => {
  switch (step.kind) {
    case "bootstrap":
      return "install vp";
    case "vp":
      return `vp ${step.from ?? "none"} -> ${step.version}`;
    case "node":
      return `node ${step.from ?? "none"} -> ${step.version}`;
    case "reinstall":
      return `${step.name} reinstall on Node`;
    case "globals":
      return step.packages
        .map((p) =>
          p.from === undefined ? `+${p.name} ${p.version}` : `${p.name} ${p.from} -> ${p.version}`,
        )
        .join(SEP);
  }
};

const repoPart = (repo: RepoStep): string | undefined => {
  if (repo.decision.run) return `${repo.name} install (${repo.decision.reason})`;
  return undefined;
};

export const summarize = (plan: MachinePlan): string => {
  // Every Ship copies the config (ADR 0008), so every plan starts with it.
  const parts = [
    "config",
    ...plan.vp.map(vpPart),
    ...plan.repos.map(repoPart).filter((p) => p !== undefined),
  ];
  const upToDate = plan.repos.filter((r) => !r.decision.run).length;
  if (upToDate > 0) parts.push(`${upToDate} repo${upToDate === 1 ? "" : "s"} up to date`);
  return parts.join(SEP);
};
