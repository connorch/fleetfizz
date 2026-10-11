# fleetfizz

## 0.4.0

### Minor Changes

- [`52f13a9`](https://github.com/connorch/fleetfizz/commit/52f13a9623e400f2b8c5317e47ac67686aec1ad4) Thanks [@connorch](https://github.com/connorch)! - The config is `~/.config/fleetfizz/config.jsonc` and the schema next to it is `schema.json` (were `fleet.config.jsonc` and `fleet.schema.json`). Move the file on the Machine you ship from; the next Ship writes the new names everywhere else.
  The first Ship after upgrading does not read the other Machines' old `fleet.config.jsonc`, so it cannot warn if one of them holds a newer config; ship from the Machine that shipped last.

## 0.3.0

### Minor Changes

- [`88f5835`](https://github.com/connorch/fleetfizz/commit/88f58356e1a25e3c46f338ac3845c8f96aeeacde) Thanks [@connorch](https://github.com/connorch)! - The command is `fizz` (`fizz ship`). The npm package stays `fleetfizz`.

## 0.2.3

### Patch Changes

- [`c3bd1ba`](https://github.com/connorch/fleetfizz/commit/c3bd1ba06a12bd167baa7cec8ef8d1da746c4505) Thanks [@connorch](https://github.com/connorch)! - The stamp drops `shippedTo` entries for Machines no longer listed in `machines`.

## 0.2.2

### Patch Changes

- [`e4e4b6f`](https://github.com/connorch/fleetfizz/commit/e4e4b6ff064cf880b846d541d5c9745087116ca0) Thanks [@connorch](https://github.com/connorch)! - Every script puts vp on PATH itself. On Ubuntu, `.bashrc` returns before vp's env file in a non-interactive shell, so a Ship over Tailscale SSH never saw vp and bootstrapped it on every Ship.

## 0.2.1

### Patch Changes

- [`888aa42`](https://github.com/connorch/fleetfizz/commit/888aa425c0185ca1ed9ed20a0baff943c5047c5a) Thanks [@connorch](https://github.com/connorch)! - Gather fails after two minutes instead of hanging the Ship when something on a Machine blocks (macOS holding a `git` on an external SSD until tailscaled's privacy prompt is answered, for example).

## 0.2.0

### Minor Changes

- [`ce9cffe`](https://github.com/connorch/fleetfizz/commit/ce9cffe71d75953f72f9f4286910826078975222) Thanks [@connorch](https://github.com/connorch)! - The config moves to `~/.config/fleetfizz/fleet.config.jsonc` and `machines` is the Fleet. Every Ship stamps the config, copies it and the JSON Schema to every Machine, and installs its own fleetfizz version there; a Machine without vp is bootstrapped. A newer config on another Machine stops the Ship unless confirmed or `--overwrite-config`. The upward search from the working directory is gone; `--config` stays.

## 0.1.0

### Minor Changes

- [`9cdc805`](https://github.com/connorch/fleetfizz/commit/9cdc80507684b6d7726b87fd8b013255288cb337) Thanks [@connorch](https://github.com/connorch)! - `fleetfizz ship`: Tracked Repos installed from origin into Managed Clones with Install Records, Outputs, and Files; the Lent Token for private repos; the vp section (vp version, Node default, Globals) with above-range questions, `--bump`, and `--enforce`; `--dry-run`, `--only`, and `--rebuild`.

## 0.0.1

### Patch Changes

- [`277ad04`](https://github.com/connorch/fleetfizz/commit/277ad04d9d39457798568ccf29a3195f9fa9344e) Thanks [@connorch](https://github.com/connorch)! - First publish: the `fleetfizz` CLI with `--help` and `--version`, and the `fleet.schema.json` skeleton. `ship` is not implemented yet.
