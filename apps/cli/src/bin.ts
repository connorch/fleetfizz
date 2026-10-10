import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { Command } from "effect/cli";

import packageJson from "../package.json" with { type: "json" };

const ship = Command.make("ship").pipe(
  Command.withDescription("Ship the config to every reachable Machine."),
  Command.withHandler(() => Effect.logWarning("ship is not implemented yet")),
);

const fleetfizz = Command.make("fleetfizz").pipe(
  Command.withDescription("Keep every Machine on your tailnet in line with one config."),
  Command.withSubcommands([ship]),
);

Command.run(fleetfizz, { version: packageJson.version }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
