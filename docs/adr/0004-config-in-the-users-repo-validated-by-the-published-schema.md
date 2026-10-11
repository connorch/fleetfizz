---
status: superseded by ADR-0008
---

# Config lives in the user's repo, validated by the published JSON Schema

fleetfizz contains no personal config, because it may become a product. A user's config is a `fleet.config.jsonc` in a repo they already have (Connor's is in connorch/skills). It is data, not code: JSON with comments, validated in the editor by a JSON Schema that the `fleetfizz` npm package ships (`"$schema": "./node_modules/fleetfizz/fleet.schema.json"`), and at runtime by the Effect Schema the JSON Schema is generated from. That repo depends on `fleetfizz` from npm as a devDependency and runs it from there (`"ship": "fleetfizz ship"`), so the CLI and the schema are always the same version, pinned by that repo's lockfile.

## Considered Options

- **A TypeScript config (`fleet.config.ts` with `satisfies FleetConfig`) (rejected).** The first choice. It needs a self-contained published `.d.ts`, loading user code to read the config, and an AST edit for "bump". Nothing in the config computes anything, so a data file loses nothing today. It can be added as a second accepted format if a config ever needs code.
- **Config at `~/.config/fleetfizz/` with its own git repo (rejected).** Connor chose to keep it in connorch/skills.
- **fleetfizz installs itself as a Tracked Repo or a vp Global (rejected).** Either gives a second fleetfizz version that can drift from the schema the config is checked against.
- **A private GitHub dependency (rejected).** The config repo runs `pnpm install` on every Machine as its Install Command, where a private dependency would not install.

## Consequences

- `fleetfizz` is published to npm early, as a public unscoped package, even while its GitHub repo is private.
- The JSON Schema is generated from the Effect Schema at build time and checked in CI, so the two cannot drift.
- "Bump" edits the config with jsonc-parser, which changes one value and keeps comments and formatting.
- Upgrading fleetfizz means bumping the devDependency in the config repo.
