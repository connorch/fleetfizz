// @fleetfizz/remote: the tailnet, transport, remote scripts, and the marker protocol.
export { applyScript, applyStdin, CONFIG_STEP, END_STEP, stepScript, stepStdin } from "./apply.ts";
export {
  CONFIG_DIR_SH,
  CHECK_ENV,
  checkScript,
  CONFIG_RECORD,
  LOGS_DIR,
  RECORDS_DIR,
  recordDir,
  recordFile,
  STATE_DIR,
  type CheckInput,
} from "./check.ts";
export {
  doneLine,
  parseLine,
  skipLine,
  stepLine,
  type Line,
  type StepDone,
  type StepSkip,
} from "./protocol.ts";
export { fingerprintFn, preludeFor, quote, quotePath } from "./shell.ts";
export { parseTailnet, readTailnet, TailnetError, type Machine, type Tailnet } from "./tailnet.ts";
export { readLentToken, type LentToken } from "./token.ts";
export { runScript, SpawnError, SSH_UNREACHABLE, type Target } from "./transport.ts";
export { latestVersion, resolveVersions } from "./versions.ts";
