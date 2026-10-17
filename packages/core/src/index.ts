// @fleetfizz/core: the Provider engine. Pure; the only Effects are the
// Provider resolve signatures, which run elsewhere.
export {
  dependenciesOf,
  machinesNamed,
  planMachine,
  targetedItems,
  type MachinePlan,
  type PlanInput,
  type ProviderPlan,
} from "./engine.ts";
export {
  address,
  decideRangeItem,
  isQuestionKind,
  orderProviders,
  parseAddress,
  QUESTION_CHOICES,
  type AnyProvider,
  type Context,
  type Decision,
  type Provider,
  type Question,
  type QuestionKind,
  type Scope,
  type Step,
  type Targeted,
} from "./provider.ts";
export { decideRange, type RangeDecision } from "./range.ts";
export {
  decideInstall,
  type InstallDecision,
  type InstallInputs,
  type InstallRecord,
} from "./record.ts";
export { assembleState, AtFact, emptyState, type MachineState } from "./state.ts";
export { targets, type MachineIdentity, type Targeting } from "./targeting.ts";
