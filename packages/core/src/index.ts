// @fleetfizz/core: pure planning. No I/O.
export {
  expandHome,
  NODE_PACKAGE,
  plan,
  VP_PACKAGE,
  type Answer,
  type Failure,
  type MachinePlan,
  type PlanInput,
  type Question,
  type Rebuild,
  type RepoStep,
  type Skipped,
  type VpStep,
} from "./plan.ts";
export { decideRange, type RangeDecision } from "./range.ts";
export {
  decideInstall,
  type InstallDecision,
  type InstallInputs,
  type InstallRecord,
} from "./record.ts";
export {
  assembleState,
  emptyState,
  Fact,
  GlobalEntry,
  InstallRecordSchema,
  type MachineState,
  type RepoState,
} from "./state.ts";
export { targets, type MachineIdentity, type Targeting } from "./targeting.ts";
