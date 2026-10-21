// A Fleet the suite ships to: real Machines that the Starting Machine reaches
// over plain ssh, through the `tailscale` shim (fleet/tailscale). Each kind of
// Fleet (Docker containers, users on one Mac, a Tart VM with containers) is a
// layer of this service, and the scenarios run the same against every one.
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import type { Platform } from "@fleetfizz/config";

import { execOk, type E2EError, type Ran } from "./exec.ts";

export interface FleetMachine {
  readonly name: string;
  readonly platform: Platform;
  // How the Starting Machine reaches it: the arguments to `ssh`
  // (`fizz@linux-b`). The Starting Machine has none.
  readonly ssh?: string;
}

export class Fleet extends Context.Service<
  Fleet,
  {
    // The Starting Machine first, then at least one other.
    readonly machines: readonly [FleetMachine, FleetMachine, ...ReadonlyArray<FleetMachine>];
    // How the second Machine reaches the Starting Machine: the arguments to
    // `ssh`. `fizz logs` there reads a Ship Log from the Starting Machine.
    readonly sshToStart: string;
    // The Fleet's npm registry, as the host reaches it to publish the build.
    // Every Machine installs fleetfizz from it.
    readonly registry: string;
    // Runs `script` in a login shell on `machine`, as the user fizz runs as
    // there.
    readonly run: (machine: string, script: string, stdin?: string) => Effect.Effect<Ran, E2EError>;
    // Makes `machine` unreachable, as a Machine that is off is, and back.
    readonly stop: (machine: string) => Effect.Effect<void, E2EError>;
    readonly resume: (machine: string) => Effect.Effect<void, E2EError>;
  }
>()("@fleetfizz/e2e/fleet") {}

export type SshKeys = Effect.Success<typeof sshKeys>;

// A throwaway ed25519 key pair for one run: every Machine trusts the public
// key, and the Starting Machine signs in with the private one.
export const sshKeys = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  yield* execOk("ssh-keygen", [
    "-q",
    "-t",
    "ed25519",
    "-N",
    "",
    "-C",
    "fleetfizz-e2e",
    "-f",
    `${dir}/key`,
  ]);
  return {
    publicKey: (yield* fs.readFileString(`${dir}/key.pub`)).trim(),
    privateKey: yield* fs.readFileString(`${dir}/key`),
    // Removed with the rest of the run's scope.
    privateKeyPath: `${dir}/key`,
  };
});
