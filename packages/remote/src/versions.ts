// Published versions, read from the npm registry over HTTP so that no package
// manager is needed, and resolved once on the Starting Machine so that every
// Machine gets the same version during one Ship.
import * as Effect from "effect/Effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import * as Schema from "effect/Schema";

// A package's URL on the registry; a scoped name keeps its `@` but escapes its `/`.
const registryUrl = (pkg: string) => `https://registry.npmjs.org/${pkg.replace("/", "%2F")}`;

// The abbreviated package document, which lists every version by key.
const Packument = Schema.Struct({ versions: Schema.Record(Schema.String, Schema.Unknown) });

const Manifest = Schema.Struct({ version: Schema.String });

// Every published version of `pkg`. A package that cannot be resolved
// (offline, unknown name) gets an empty list, which the planner reports as
// unavailable.
const resolveOne = Effect.fn("resolveOne")(
  function* (pkg: string) {
    const response = yield* HttpClient.get(registryUrl(pkg), {
      accept: "application/vnd.npm.install-v1+json",
    });
    const { versions } = yield* HttpClientResponse.schemaBodyJson(Packument)(response);
    return Object.keys(versions) as ReadonlyArray<string>;
  },
  Effect.timeout("10 seconds"),
  Effect.orElseSucceed((): ReadonlyArray<string> => []),
  Effect.provide(FetchHttpClient.layer),
);

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

// The version `pkg`'s `latest` tag names; undefined when it cannot be read.
export const latestVersion = Effect.fn("latestVersion")(
  function* (pkg: string) {
    const response = yield* HttpClient.get(`${registryUrl(pkg)}/latest`);
    return (yield* HttpClientResponse.schemaBodyJson(Manifest)(response)).version;
  },
  Effect.timeout("10 seconds"),
  Effect.orElseSucceed(() => undefined),
  Effect.provide(FetchHttpClient.layer),
);
