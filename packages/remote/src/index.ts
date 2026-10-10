// @fleetfizz/remote: the tailnet, transport, remote scripts, and the marker protocol.
export { applyScript, END_STEP, stepId, type ApplyInput } from "./apply.ts";
export {
  gatherScript,
  RECORDS_DIR,
  STATE_DIR,
  type GatherInput,
  type GatherRepo,
} from "./gather.ts";
export { doneLine, parseLine, stepLine, type Line, type StepDone } from "./protocol.ts";
export { fingerprintFn, prelude, quote, quotePath } from "./shell.ts";
export { parseTailnet, readTailnet, TailnetError, type Machine, type Tailnet } from "./tailnet.ts";
export { readLentToken, type LentToken } from "./token.ts";
export { runScript, SpawnError, SSH_UNREACHABLE, type Target } from "./transport.ts";
export { resolveVersions } from "./versions.ts";
