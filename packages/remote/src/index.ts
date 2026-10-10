// @fleetfizz/remote: the tailnet, transport, remote scripts, and the marker protocol.
export {
  gatherScript,
  RECORDS_FILE,
  STATE_DIR,
  type GatherInput,
  type GatherRepo,
} from "./gather.ts";
export { doneLine, parseLine, stepLine, type Line, type StepDone } from "./protocol.ts";
export { prelude, quote, quotePath } from "./shell.ts";
export { parseTailnet, readTailnet, TailnetError, type Machine, type Tailnet } from "./tailnet.ts";
export { runScript, SpawnError, SSH_UNREACHABLE, type Target } from "./transport.ts";
export { resolveVersions } from "./versions.ts";
