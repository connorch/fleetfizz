// Published versions, resolved once on the Starting Machine so that every
// Machine gets the same version during one Ship.
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const Versions = Schema.fromJsonString(Schema.Union([Schema.Array(Schema.String), Schema.String]));

// `npm view <pkg> versions --json`. A package that cannot be resolved (offline,
// unknown name) gets an empty list, which the planner reports as unavailable.
const resolveOne = Effect.fn("resolveOne")(function* (pkg: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const output = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make("npm", ["view", pkg, "versions", "--json"], {
          stdout: "pipe",
          stderr: "pipe",
        }),
      );
      const [stdout, exitCode] = yield* Effect.all(
        [
          Stream.runCollect(Stream.decodeText(handle.stdout)),
          Stream.runDrain(handle.stderr),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.map(([stdout, , code]) => [stdout.join(""), code] as const));
      return exitCode === 0 ? stdout : "";
    }),
  ).pipe(Effect.orElseSucceed(() => ""));
  if (output.trim() === "") return [] as ReadonlyArray<string>;
  const parsed = yield* Schema.decodeUnknownEffect(Versions)(output).pipe(
    Effect.orElseSucceed(() => []),
  );
  return typeof parsed === "string" ? [parsed] : parsed;
});

export const resolveVersions = Effect.fn("resolveVersions")(function* (
  packages: ReadonlyArray<string>,
) {
  const unique = [...new Set(packages)];
  const entries = yield* Effect.forEach(
    unique,
    (pkg) => resolveOne(pkg).pipe(Effect.map((v) => [pkg, v] as const)),
    {
      concurrency: 8,
    },
  );
  return Object.fromEntries(entries) as Readonly<Record<string, ReadonlyArray<string>>>;
});
