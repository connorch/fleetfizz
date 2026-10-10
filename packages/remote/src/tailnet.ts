// The Fleet, as `tailscale status --json` reports it: this Machine plus every
// macOS and linux peer. Machines are named by the first label of their
// MagicDNS name (connors-mac-studio), which stays stable when the OS hostname
// does not.
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import type { Platform } from "@fleetfizz/config";

const StatusNode = Schema.Struct({
  DNSName: Schema.String,
  OS: Schema.String,
  Online: Schema.optionalKey(Schema.Boolean),
  sshHostKeys: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
});
type StatusNode = typeof StatusNode.Type;

const TailscaleStatus = Schema.Struct({
  Self: StatusNode,
  Peer: Schema.optionalKey(Schema.NullOr(Schema.Record(Schema.String, StatusNode))),
});

export interface Machine {
  readonly name: string;
  readonly platform: Platform;
  readonly online: boolean;
  // Runs a Tailscale SSH server. Always false for the Starting Machine's own
  // entry, which runs scripts locally.
  readonly ssh: boolean;
}

export interface Tailnet {
  readonly self: Machine;
  // Every macOS and linux Machine, the Starting Machine included, sorted by name.
  readonly fleet: ReadonlyArray<Machine>;
}

export class TailnetError extends Schema.TaggedError<TailnetError>()("TailnetError", {
  reason: Schema.String,
}) {
  override get message() {
    return `tailscale: ${this.reason}`;
  }
}

const PLATFORM_BY_OS: Readonly<Record<string, Platform>> = { macOS: "darwin", linux: "linux" };

const toMachine = (node: StatusNode): Machine | undefined => {
  const platform = PLATFORM_BY_OS[node.OS];
  const name = node.DNSName.split(".")[0];
  if (platform === undefined || name === undefined || name === "") return undefined;
  return {
    name,
    platform,
    online: node.Online ?? false,
    ssh: (node.sshHostKeys?.length ?? 0) > 0,
  };
};

export const parseTailnet = Effect.fn("parseTailnet")(function* (status: unknown) {
  const parsed = yield* Schema.decodeUnknownEffect(TailscaleStatus)(status).pipe(
    Effect.mapError((issue) => new TailnetError({ reason: `unexpected status output: ${issue}` })),
  );
  const self = toMachine(parsed.Self);
  if (self === undefined) {
    return yield* new TailnetError({ reason: `this Machine's OS (${parsed.Self.OS}) cannot ship` });
  }
  const me: Machine = { ...self, online: true };
  const peers = Object.values(parsed.Peer ?? {}).flatMap((node) => toMachine(node) ?? []);
  const tailnet: Tailnet = {
    self: me,
    fleet: [me, ...peers].sort((a, b) => a.name.localeCompare(b.name)),
  };
  return tailnet;
});

export const readTailnet = Effect.fn("readTailnet")(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const output = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make("tailscale", ["status", "--json"], { stdout: "pipe", stderr: "pipe" }),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          Stream.runCollect(Stream.decodeText(handle.stdout)),
          Stream.runCollect(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      );
      if (exitCode !== 0) {
        return yield* new TailnetError({
          reason: stderr.join("").trim() || `tailscale status exited with ${exitCode}`,
        });
      }
      return stdout.join("");
    }),
  ).pipe(
    Effect.mapError((e) =>
      Schema.is(TailnetError)(e) ? e : new TailnetError({ reason: e.message }),
    ),
  );
  const json = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
    output,
  ).pipe(Effect.mapError(() => new TailnetError({ reason: "status output is not JSON" })));
  return yield* parseTailnet(json);
});
