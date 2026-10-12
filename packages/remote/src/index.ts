// @fleetfizz/remote: the tailnet, transport, remote scripts, and the marker protocol.
export {
  applyScript,
  applyStdin,
  CONFIG_STEP,
  END_STEP,
  isFetchStep,
  stepId,
  vpStepId,
  type ApplyInput,
} from "./apply.ts";
export {
  CONFIG_DIR_SH,
  checkScript,
  RECORDS_DIR,
  STATE_DIR,
  type CheckInput,
  type CheckRepo,
} from "./check.ts";
export { doneLine, parseLine, stepLine, type Line, type StepDone } from "./protocol.ts";
export { fingerprintFn, prelude, quote, quotePath } from "./shell.ts";
export { parseTailnet, readTailnet, TailnetError, type Machine, type Tailnet } from "./tailnet.ts";
export { readLentToken, type LentToken } from "./token.ts";
export { runScript, SpawnError, SSH_UNREACHABLE, type Target } from "./transport.ts";
export { resolveVersions } from "./versions.ts";
