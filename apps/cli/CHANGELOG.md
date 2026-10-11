# fleetfizz

## 0.2.0

### Minor Changes

- [`ce9cffe`](https://github.com/connorch/fleetfizz/commit/ce9cffe71d75953f72f9f4286910826078975222) Thanks [@connorch](https://github.com/connorch)! - The config moves to `~/.config/fleetfizz/fleet.config.jsonc` and `machines` is the Fleet. Every Ship stamps the config, copies it and the JSON Schema to every Machine, and installs its own fleetfizz version there; a Machine without vp is bootstrapped. A newer config on another Machine stops the Ship unless confirmed or `--overwrite-config`. The upward search from the working directory is gone; `--config` stays.

## 0.1.0

### Minor Changes

- [`9cdc805`](https://github.com/connorch/fleetfizz/commit/9cdc80507684b6d7726b87fd8b013255288cb337) Thanks [@connorch](https://github.com/connorch)! - `fleetfizz ship`: Tracked Repos installed from origin into Managed Clones with Install Records, Outputs, and Files; the Lent Token for private repos; the vp section (vp version, Node default, Globals) with above-range questions, `--bump`, and `--enforce`; `--dry-run`, `--only`, and `--rebuild`.

## 0.0.1

### Patch Changes

- [`277ad04`](https://github.com/connorch/fleetfizz/commit/277ad04d9d39457798568ccf29a3195f9fa9344e) Thanks [@connorch](https://github.com/connorch)! - First publish: the `fleetfizz` CLI with `--help` and `--version`, and the `fleet.schema.json` skeleton. `ship` is not implemented yet.
