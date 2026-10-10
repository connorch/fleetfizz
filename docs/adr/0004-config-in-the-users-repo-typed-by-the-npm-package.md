# Config lives in the user's repo, typed by the published npm package

fleetfizz contains no personal config, because it may become a product. A user's config is a `fleet.config.ts` in a repo they already have (Connor's is in connorch/skills), which imports `type { FleetConfig } from "fleetfizz"` and ends with `satisfies FleetConfig`. That repo depends on `fleetfizz` from npm as a devDependency and runs it from there (`"ship": "fleetfizz ship"`), so the CLI and the config types are always the same version, pinned by that repo's lockfile.

## Considered Options

- **Config at `~/.config/fleetfizz/fleet.config.ts` with its own git repo (rejected).** Connor chose to keep it in connorch/skills.
- **fleetfizz installs itself as a Tracked Repo or a vp Global (rejected).** Either gives a second fleetfizz version that can drift from the types the config is checked against.
- **A generated, gitignored `.fleetfizz/types.d.ts` (rejected).** A real devDependency is the right end state, so publish early instead.
- **A private GitHub dependency (rejected).** The config repo runs `pnpm install` on every Machine as its Install Command, where a private dependency would not install.

## Consequences

- `fleetfizz` is published to npm early, as a public unscoped package, even while its GitHub repo is private.
- The published `.d.ts` must be self-contained: no imports of the private `@fleetfizz/*` workspace packages, and no import of `effect` unless `effect` is a dependency of the published package. CI checks this.
- `FleetConfig` is the Schema's encoded (input) type, because that is what a user writes. Node's type stripping erases `import type`, so loading the config never needs the package at runtime, and fleetfizz validates it with the Schema anyway.
- Upgrading fleetfizz means bumping the devDependency in the config repo.
