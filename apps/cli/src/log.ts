// The Ship Log: everything one Ship did, written on the Starting Machine as it
// happens (ADR 0015). Every Machine's scripts and every line they printed, the
// Ship's own decisions, and full errors. `fizz logs` reads one back from any
// Machine, over tailscale ssh when another Machine started that Ship.
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Logger from "effect/Logger";
import * as References from "effect/References";

import {
  LOGS_DIR,
  quote,
  quotePath,
  readTailnet,
  runScript,
  SSH_UNREACHABLE,
  type Target,
} from "@fleetfizz/remote";

import { readConfigRecord } from "./configRecord.ts";
import { makeStateDirectory } from "./stateDirectory.ts";

// How many Ship Logs a Machine keeps.
export const KEEP = 20;

// A problem with `fizz logs` the person can fix. Printed without a stack trace.
export class LogsError extends Error {
  override readonly name = "LogsError";
}

// A Ship's id, which names its log: when it started (UTC, to the second) and
// the Starting Machine. Sorting one Machine's ids by name sorts them by time.
export const shipId = (started: DateTime.Utc, from: string): string =>
  `${DateTime.formatIso(started).slice(0, 19).replaceAll(":", "-")}Z-${from}`;

export const parseShipId = (
  id: string,
): { readonly started: number; readonly from: string } | undefined => {
  const [, day, h, m, s, from] =
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z-(.+)$/.exec(id) ?? [];
  if (from === undefined) return undefined;
  return { started: Date.parse(`${day}T${h}:${m}:${s}Z`), from };
};

// One log entry as lines of `<time> <LEVEL> [<machine> <phase>] <text>`, one
// per line of its text, so grep and `--machine` see every line. Entries
// outside any Machine have no brackets. Secrets in `hidden` never reach the
// file; the set may grow while the Ship runs.
export const lineFormat = (hidden: ReadonlySet<string>) =>
  Logger.make(({ message, logLevel, date, cause, fiber }) => {
    const { machine, phase } = fiber.getRef(References.CurrentLogAnnotations);
    const scope = [machine, phase].filter((s) => typeof s === "string").join(" ");
    const prefix = `${date.toISOString()} ${logLevel.toUpperCase().padEnd(5)}${scope === "" ? "" : ` [${scope}]`}`;
    const parts = (Array.isArray(message) ? message : [message]).map((m) =>
      typeof m === "string" ? m : JSON.stringify(m),
    );
    if (cause.reasons.length > 0) parts.push(Cause.pretty(cause));
    let text = parts.join(" ");
    for (const secret of hidden) text = text.replaceAll(secret, "[hidden]");
    return text
      .split("\n")
      .map((line) => `${prefix} ${line}`)
      .join("\n");
  });

// The Machine a log line belongs to, from its brackets.
export const machineOf = (line: string): string | undefined =>
  /^\S+ +\S+ +\[([^\] ]+)/.exec(line)?.[1];

// The files to delete before writing one more log, so KEEP remain: the oldest.
export const toPrune = (names: ReadonlyArray<string>): string[] => {
  const logs = names.filter((name) => name.endsWith(".log")).toSorted();
  return logs.slice(0, Math.max(0, logs.length - (KEEP - 1)));
};

const logsDir = () => LOGS_DIR.replace(/^~/, process.env.HOME ?? "~");

// Opens the Ship Log for `id` as a logger that lives as long as the scope,
// after deleting the oldest logs. Only this Machine's user can read it.
export const openShipLog = Effect.fn("openShipLog")(function* (
  id: string,
  hidden: ReadonlySet<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const dir = logsDir();
  yield* makeStateDirectory(dir);
  for (const name of toPrune(yield* fs.readDirectory(dir))) yield* fs.remove(`${dir}/${name}`);
  return yield* Logger.toFile(lineFormat(hidden), `${dir}/${id}.log`, { mode: 0o600 });
});

// Runs a small script on the Machine that has the logs: this one locally, any
// other over tailscale ssh, like a Check.
const read = Effect.fn("read")(function* (
  target: Target,
  script: string,
  onLine: (line: string) => Effect.Effect<void>,
) {
  const code = yield* runScript(target, script, [], onLine);
  if (!target.local && code === SSH_UNREACHABLE)
    return yield* Effect.fail(new LogsError(`could not reach ${target.name} over tailscale ssh`));
});

// The Ship ids in one Machine's logs, oldest first.
const shipIds = Effect.fn("shipIds")(function* (target: Target) {
  const ids: string[] = [];
  yield* read(target, `ls -1 ${quotePath(LOGS_DIR)} 2>/dev/null`, (line) =>
    Effect.sync(() => {
      if (line.endsWith(".log")) ids.push(line.slice(0, -".log".length));
    }),
  );
  return ids.toSorted();
});

const MISSING = "ff-missing";

export interface LogsFlags {
  readonly id: string | undefined;
  readonly machine: string | undefined;
  readonly list: boolean;
}

// `fizz logs`: prints one Ship Log, by default the latest Ship that started
// on or reached this Machine. The tailnet is read only to reach another
// Machine, so the logs here stay readable when Tailscale is down.
export const logs = Effect.fn("logs")(function* (flags: LogsFlags) {
  const here: Target = { name: "this Machine", local: true };
  const local = yield* shipIds(here);
  // This Machine's name, from its own logs (only a Starting Machine has any).
  const self = parseShipId(local.at(-1) ?? "")?.from;
  const tailnet = yield* Effect.cached(readTailnet());
  const targetOf = Effect.fn("targetOf")(function* (name: string) {
    if (name === self) return here;
    const { self: me, fleet } = yield* tailnet;
    if (name === me.name) return here;
    const machine = fleet.find((m) => m.name === name);
    if (machine === undefined)
      return yield* Effect.fail(new LogsError(`no Machine ${name} on the tailnet`));
    if (!machine.online)
      return yield* Effect.fail(new LogsError(`${name} is offline; its logs are there`));
    return { name, local: false } satisfies Target;
  });

  if (flags.list) {
    if (local.length === 0) return yield* Console.log("no Ship Log on this Machine yet");
    for (const id of local.toReversed()) yield* Console.log(id);
    return;
  }

  const id = flags.id ?? (yield* latestShip(local, self));
  const ship = parseShipId(id);
  if (ship === undefined)
    return yield* Effect.fail(new LogsError(`not a Ship id: ${id} (fizz logs --list shows them)`));
  let missing = false;
  yield* read(
    local.includes(id) ? here : yield* targetOf(ship.from),
    `ff_log=${quotePath(LOGS_DIR)}/${quote(`${id}.log`)}\nif [ -f "$ff_log" ]; then cat "$ff_log"; else echo ${MISSING}; fi`,
    (line) => {
      if (line === MISSING) return Effect.sync(() => void (missing = true));
      if (flags.machine !== undefined && machineOf(line) !== flags.machine) return Effect.void;
      return Console.log(line);
    },
  );
  if (missing)
    return yield* Effect.fail(
      new LogsError(`no log for ${id} on ${ship.from}; a Machine keeps its last ${KEEP}`),
    );
});

// The latest Ship that started on or reached this Machine: the newest log
// here (`local`, oldest first), unless the config's Install Record says a
// Ship from another Machine reached it later. That Ship's log is on its
// Starting Machine.
const latestShip = Effect.fn("latestShip")(function* (
  local: ReadonlyArray<string>,
  self: string | undefined,
) {
  const newest = local.at(-1);
  const record = yield* readConfigRecord;
  const from = parseShipId(record?.ship ?? "")?.from;
  // When it reached this Machine. Without logs here this Machine's name is
  // unknown, but then nothing here is newer than the record anyway.
  const at = self === undefined ? Infinity : Date.parse(record?.reached[self] ?? "");
  const newestStarted = parseShipId(newest ?? "")?.started ?? -Infinity;
  if (record !== undefined && from !== undefined && from !== self && at > newestStarted)
    return record.ship;
  if (newest === undefined)
    return yield* Effect.fail(new LogsError("no Ship Log on this Machine yet"));
  return newest;
});
