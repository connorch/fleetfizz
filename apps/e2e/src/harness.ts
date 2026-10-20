// Readies a Fleet for the scenarios and runs them: publishes the build to the
// Fleet's Verdaccio, sets up the Starting Machine as a user would (fizz from
// a package manager, a Config, a Shared File), then ships from it and reads
// back what happened, from fizz's Ledger and from each Machine itself.
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { FleetConfig } from "@fleetfizz/config";

import packageJson from "../../cli/package.json" with { type: "json" };
import { E2EError, execOk } from "./exec.ts";
import { Fleet, type FleetMachine } from "./fleet.ts";
import {
  FIXTURE_ORIGIN,
  fixtureConfig,
  OUTPUT,
  SHARED_DIR,
  SKILL,
  writeShared,
} from "./fixture.ts";

// Where the shim lives on the Starting Machine. fizz finds it first on PATH;
// nothing else there sees it.
const SHIM_DIR = "$HOME/.e2e/bin";

// What `tailscale status --json` reports, as much of it as fizz reads.
const StatusNode = Schema.Struct({
  DNSName: Schema.String,
  OS: Schema.String,
  Online: Schema.Boolean,
  sshHostKeys: Schema.NullOr(Schema.Array(Schema.String)),
});
const StatusJson = Schema.fromJsonString(
  Schema.Struct({ Self: StatusNode, Peer: Schema.Record(Schema.String, StatusNode) }),
);

const statusNode = (machine: FleetMachine) => ({
  DNSName: `${machine.name}.fleetfizz-e2e.ts.net.`,
  OS: machine.platform === "darwin" ? "macOS" : "linux",
  Online: true,
  // Tailscale reports no host keys for itself.
  sshHostKeys: machine.ssh === undefined ? null : ["fleetfizz-e2e"],
});

// The fixtures' branch: E2E_REF, else this checkout's branch when GitHub has
// it, else main. Both the Tracked Repo and the Skill come from it.
const fixtureRef = Effect.gen(function* () {
  const given = yield* Config.option(Config.String("E2E_REF"));
  if (Option.isSome(given)) return given.value;
  const branch = (yield* execOk("git", ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const remote = yield* execOk("git", [
    "ls-remote",
    "--heads",
    `https://github.com/${FIXTURE_ORIGIN}.git`,
    branch,
  ]);
  return remote.trim() === "" ? "main" : branch;
});

// Publishes apps/cli, already built, to the Fleet's Verdaccio as a new user
// there.
const publish = Effect.fn("publish")(function* (registry: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cli = yield* path.fromFileUrl(new URL("../../cli", import.meta.url));
  const user = yield* execOk("curl", [
    "--silent",
    "--fail",
    "--request",
    "PUT",
    "--header",
    "content-type: application/json",
    "--data",
    '{"name":"fleetfizz-e2e","password":"fleetfizz-e2e"}',
    `${registry}-/user/org.couchdb.user:fleetfizz-e2e`,
  ]);
  const { token } = yield* Schema.decodeEffect(
    Schema.fromJsonString(Schema.Struct({ token: Schema.String })),
  )(user);
  const dir = yield* fs.makeTempDirectoryScoped();
  yield* fs.writeFileString(
    `${dir}/npmrc`,
    `${registry.replace(/^https?:/, "")}:_authToken=${token}\n`,
  );
  yield* execOk("pnpm", ["publish", "--registry", registry, "--no-git-checks"], {
    cwd: cli,
    env: { NPM_CONFIG_USERCONFIG: `${dir}/npmrc` },
  });
}, Effect.scoped);

// A Fleet, ready to ship from: what the scenarios check against.
export class Prepared extends Context.Service<
  Prepared,
  {
    // The fleetfizz under test, on every Machine after the first Ship.
    readonly version: string;
    // The commit of the fixtures' branch: every Managed Clone's HEAD.
    readonly commit: string;
  }
>()("@fleetfizz/e2e/harness/Prepared") {
  static readonly layer = Layer.effect(
    Prepared,
    Effect.gen(function* () {
      const fleet = yield* Fleet;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const [start, ...remotes] = fleet.machines;
      const version = packageJson.version;
      const ref = yield* fixtureRef;
      const heads = yield* execOk("git", [
        "ls-remote",
        `https://github.com/${FIXTURE_ORIGIN}.git`,
        `refs/heads/${ref}`,
      ]);
      const commit = heads.split("\t")[0] ?? "";

      yield* publish(fleet.registry);

      const onStart = (script: string, stdin?: string) =>
        fleet
          .run(start.name, script, stdin)
          .pipe(
            Effect.flatMap((ran) =>
              ran.exitCode === 0
                ? Effect.void
                : Effect.fail(
                    new E2EError({ message: `on ${start.name}: ${script}\n${ran.output}` }),
                  ),
            ),
          );
      const shim = yield* fs.readFileString(
        yield* path.fromFileUrl(new URL("../fleet/tailscale", import.meta.url)),
      );
      const status = yield* Schema.encodeEffect(StatusJson)({
        Self: statusNode(start),
        Peer: Object.fromEntries(remotes.map((m) => [m.name, statusNode(m)])),
      });
      const targets = remotes.map((m) => `${m.name} ${m.ssh}\n`).join("");
      const config = yield* Schema.decodeEffect(FleetConfig)(
        fixtureConfig(fleet.machines, version, ref),
      );
      const configText = yield* Schema.encodeEffect(Schema.fromJsonString(FleetConfig))(config);

      yield* onStart(
        `mkdir -p ${SHIM_DIR} && cat > ${SHIM_DIR}/tailscale && chmod +x ${SHIM_DIR}/tailscale`,
        shim,
      );
      yield* onStart(`cat > ${SHIM_DIR}/status.json`, status);
      yield* onStart(`cat > ${SHIM_DIR}/targets`, targets);
      yield* onStart(
        "mkdir -p ~/.config/fleetfizz && cat > ~/.config/fleetfizz/config.jsonc",
        configText,
      );
      yield* onStart(writeShared);
      yield* onStart(`npm install --global fleetfizz@${version}`);
      return Prepared.of({ version, commit });
    }),
  );
}

// What the scenarios read of the Ledger fizz saves after a Ship.
const LedgerItem = Schema.Struct({
  name: Schema.String,
  status: Schema.String,
  changes: Schema.Boolean,
  detail: Schema.optionalKey(Schema.String),
});
const LedgerMachine = Schema.Struct({
  name: Schema.String,
  status: Schema.String,
  detail: Schema.optionalKey(Schema.String),
  items: Schema.Array(LedgerItem),
});
const LastShip = Schema.fromJsonString(Schema.Struct({ machines: Schema.Array(LedgerMachine) }));
export type LedgerMachine = typeof LedgerMachine.Type;

// Runs `fizz ship` on the Starting Machine, with no terminal, and returns its
// exit code and output, and the Ledger it saved.
export const ship = Effect.fn("ship")(function* (...args: ReadonlyArray<string>) {
  const fleet = yield* Fleet;
  const start = fleet.machines[0].name;
  const ran = yield* fleet.run(start, `PATH=${SHIM_DIR}:$PATH fizz ship ${args.join(" ")}`);
  const saved = yield* fleet.run(start, "cat ~/.local/state/fleetfizz/last-ship.json");
  const ledger = yield* Schema.decodeEffect(LastShip)(saved.output).pipe(
    Effect.mapError(() => new E2EError({ message: `no Ledger after the Ship:\n${ran.output}` })),
  );
  return { ...ran, machines: ledger.machines };
});

// What is on one Machine, read there rather than from fizz.
const Probe = Schema.Struct({
  fizz: Schema.String,
  notes: Schema.String,
  runIsExecutable: Schema.String,
  clone: Schema.String,
  output: Schema.String,
  skill: Schema.String,
  config: Schema.String,
  globals: Schema.String,
});
const PnpmList = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      dependencies: Schema.optionalKey(
        Schema.Record(Schema.String, Schema.Struct({ version: Schema.String })),
      ),
    }),
  ),
);

const PROBE = [
  `v() { printf '%s=%s\\n' "$1" "$(printf '%s' "$2" | tr '\\n' ' ')"; }`,
  // pnpm lists Globals only with its bin directory on PATH, as fizz's own
  // scripts set it: PNPM_HOME, or PNPM_HOME/bin from pnpm 11.
  `if [ "$(uname)" = Darwin ]; then PNPM_HOME="$HOME/Library/pnpm"; else PNPM_HOME="$HOME/.local/share/pnpm"; fi`,
  `export PNPM_HOME PATH="$PNPM_HOME:$PNPM_HOME/bin:$PATH"`,
  `v fizz "$(fizz --version 2>/dev/null)"`,
  `v notes "$(cat ${SHARED_DIR}/notes.txt 2>/dev/null)"`,
  `v runIsExecutable "$([ -x ${SHARED_DIR}/run.sh ] && echo yes || echo no)"`,
  `v clone "$(git -C ~/.local/share/fleetfizz/clones/fixture rev-parse HEAD 2>/dev/null)"`,
  `v output "$(cat ${OUTPUT} 2>/dev/null)"`,
  `v skill "$([ -f ~/.claude/skills/${SKILL}/SKILL.md ] && echo yes || echo no)"`,
  `v config "$(cksum < ~/.config/fleetfizz/config.jsonc 2>/dev/null)"`,
  `v globals "$(pnpm ls --global --depth 0 --json 2>/dev/null || echo '[]')"`,
].join("\n");

export const probe = Effect.fn("probe")(function* (machine: string) {
  const fleet = yield* Fleet;
  const ran = yield* fleet.run(machine, PROBE);
  const fields = Object.fromEntries(
    ran.output.split("\n").flatMap((line) => {
      const at = line.indexOf("=");
      return at === -1 ? [] : [[line.slice(0, at), line.slice(at + 1).trim()]];
    }),
  );
  const found = yield* Schema.decodeUnknownEffect(Probe)(fields).pipe(
    Effect.mapError(() => new E2EError({ message: `probe on ${machine}:\n${ran.output}` })),
  );
  const list = yield* Schema.decodeEffect(PnpmList)(found.globals);
  const globals = Object.fromEntries(
    list
      .flatMap((entry) => Object.entries(entry.dependencies ?? {}))
      .map(([name, d]) => [name, d.version]),
  );
  return { ...found, globals };
});
