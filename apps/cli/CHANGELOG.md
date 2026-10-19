# fleetfizz

## 0.9.0

### Minor Changes

- [#46](https://github.com/connorch/fleetfizz/pull/46) [`ab01420`](https://github.com/connorch/fleetfizz/commit/ab01420d6a1bcd07ac8f75776a1f57316be899c4) Thanks [@connorch](https://github.com/connorch)! - Every Ship writes a Ship Log on the Machine that started it: every Machine's scripts and every line they printed, the Ship's decisions, and full errors. The Ship ends by printing its id, and `fizz logs` prints a Ship Log from any Machine, over Tailscale SSH when another Machine started that Ship.

## 0.8.1

### Patch Changes

- [#42](https://github.com/connorch/fleetfizz/pull/42) [`a0a5c05`](https://github.com/connorch/fleetfizz/commit/a0a5c05a56132ab833fb34f7e5c6ca3bae8517ef) Thanks [@connorch](https://github.com/connorch)! - A running item in the live Ledger leads with a spinner instead of `▸`. Printed output (a pipe, the final Ledger, `fizz report`) keeps the `▸`.

## 0.8.0

### Minor Changes

- [#40](https://github.com/connorch/fleetfizz/pull/40) [`77a7a83`](https://github.com/connorch/fleetfizz/commit/77a7a837aaabf43a44b016834dcccc4107aff36d) Thanks [@connorch](https://github.com/connorch)! - Breaking: a Tracked Repo's `files` is gone. Write gitignored files from the Install Command instead, which also fits anything custom, like secrets from a password manager: `"install": "echo A=1 > .env && npm ci"`. A config that still has `files` fails to load.

## 0.7.0

### Minor Changes

- [#38](https://github.com/connorch/fleetfizz/pull/38) [`42f4ce2`](https://github.com/connorch/fleetfizz/commit/42f4ce26b8615315e2f2d953d040a67ddbe1de89) Thanks [@connorch](https://github.com/connorch)! - Every config section now has the same shape: `platforms`, `machines`, `dependsOn`, its own settings, and `items`, keyed by name (ADR 0014).
  
  - Breaking: `machines` is a list of names: `"machines": ["connors-mac-studio", "connors-macbook-pro"]`.
  - Breaking: `repos` is a section, with each Tracked Repo under `repos.items`, keyed by its name. The key names the Managed Clone and the Item (`repos:t3code`), and `name` is gone, so a repo whose name changes is cloned and installed again; its old clone is left in place.
  - Breaking: `machines.<name>.clones` moves to `repos.cloneRoot`: a path, or a list of `{ path, platforms?, machines? }` where a Machine gets the first that targets it.
  - Breaking: `vp.globals` is now `vp.items`.
  - Any Item can be a list of Variants, whole entries each with its own Targeting, and a Machine gets the first that targets it: `"vercel": [{ "platforms": ["linux"], "range": "^60" }, "^59.25.4"]`.
  - A key repeated in the config is an error instead of silently replacing the first.
  - Upgrade every Machine, then ship first from the Machine whose config is newest: the first Ship cannot read the old-shape copies elsewhere, so it overwrites them without the usual newer-config Question.

## 0.6.0

### Minor Changes

- [#28](https://github.com/connorch/fleetfizz/pull/28) [`3c93763`](https://github.com/connorch/fleetfizz/commit/3c93763526790834ab4f6a6ed1984e793e93d368) Thanks [@connorch](https://github.com/connorch)! - New `brew` and `cask` Providers keep Homebrew Formulae and Casks on every Machine: `"brew": { "items": { "gh": "*", "oven-sh/bun/bun": "latest" } }`. `"*"` installs when missing; `"latest"` runs `brew update`, then upgrades on every Ship, and the Ledger shows the version it reached. A Ship never installs Homebrew itself: `brew:brew` fails on a Machine without it.

- [#29](https://github.com/connorch/fleetfizz/pull/29) [`83d1593`](https://github.com/connorch/fleetfizz/commit/83d1593ba35ef2f51b3f6072a743592205883ee8) Thanks [@connorch](https://github.com/connorch)! - The `vp` section keeps package managers' defaults beside Node: `"vp": { "pnpm": "^10", "yarn": "^4" }`, for `npm`, `pnpm`, `yarn`, and `bun`. These need vp in managed mode, so a Machine in system-first mode gets a Question: switch every tool to managed mode, or skip its Node and package-manager defaults (the default without a terminal). `--answer mode=managed` switches in advance. A Global can no longer be named after a package manager or `mode`.

- [#27](https://github.com/connorch/fleetfizz/pull/27) [`3bb02f6`](https://github.com/connorch/fleetfizz/commit/3bb02f6958f569ebce2c022a4fdef3ed8bb80194) Thanks [@connorch](https://github.com/connorch)! - vp and Tracked Repos are now Providers in one engine, and every Item is written `provider:item` (`vp:node`, `repos:connorch-t3code`) in the Ledger, `fizz report`, and flags.
  
  - Breaking: `--rebuild` takes an address, `--rebuild repos:<name>`, or `all`.
  - `--answer kind=choice` answers Questions in advance (`range=bump|skip|downgrade`, `config=overwrite|stop`), or one of them with `kind:subject=choice` (`range:vp:vercel=bump`). `--bump`, `--enforce`, and `--overwrite-config` still work as shorthands.
  - A Global can have its own Targeting: `{ "range": "^4", "machines": ["connors-mac-studio"] }`.
  - A repo's branch is resolved to one commit on the Starting Machine, so every Machine installs the same commit in one Ship, and a dry run shows the new commit.
  - When vp, Node, or a Global fails on a Machine, that Machine's repo changes are skipped ("depends on vp").
  - Install Records move to `records/<provider>/<item>.json`; the old files are still read, and the next install moves them.

- [#21](https://github.com/connorch/fleetfizz/pull/21) [`c67a63c`](https://github.com/connorch/fleetfizz/commit/c67a63c2b2363a0f992c8022d5795057c655783e) Thanks [@connorch](https://github.com/connorch)! - When another Machine holds a newer config, `fizz ship` can use it: the Question now offers `use the config on <machine>`, which writes that config here and starts the Ship over from it, next to overwrite and stop.

### Patch Changes

- [#30](https://github.com/connorch/fleetfizz/pull/30) [`7f30417`](https://github.com/connorch/fleetfizz/commit/7f304171d8874dab0f0d3f422f86a3ea5e1d7270) Thanks [@connorch](https://github.com/connorch)! - `schema.json` describes every config field, so editors show what a field does on hover, and `fizz ship --help` names the value each flag takes (`--only machine`, `--rebuild item`, `--config path`).

## 0.5.2

### Patch Changes

- [#17](https://github.com/connorch/fleetfizz/pull/17) [`5d6d349`](https://github.com/connorch/fleetfizz/commit/5d6d349b0f2be14858b272d26c8cb3a940a5c9e2) Thanks [@connorch](https://github.com/connorch)! - The Ledger's last line counts Machines in the words of their own summaries, leaving out zero counts: `2 up to date` or `1 to change, 1 up to date` in a dry run, `1 updated, 1 failed  in 5m 12s` after a Ship. It used to say `planned 2  skipped 0  failed 0`, which read like work was coming when every Machine was up to date.

## 0.5.1

### Patch Changes

- [#15](https://github.com/connorch/fleetfizz/pull/15) [`330d1f2`](https://github.com/connorch/fleetfizz/commit/330d1f2cf177b6388a8fea7ac2b98879834baa90) Thanks [@connorch](https://github.com/connorch)! - The Ledger says `checking` while a Machine is read and `waiting` once it is read, instead of `gathering` and `gathered`.

- [#15](https://github.com/connorch/fleetfizz/pull/15) [`330d1f2`](https://github.com/connorch/fleetfizz/commit/330d1f2cf177b6388a8fea7ac2b98879834baa90) Thanks [@connorch](https://github.com/connorch)! - The live Ledger always fits the window, and when a Ship ends its result prints once as ordinary output, so the shell prompt no longer lands on the summary line. The Ledger is drawn by one Ink component everywhere: live, piped, and in `fizz report`.

- [#15](https://github.com/connorch/fleetfizz/pull/15) [`330d1f2`](https://github.com/connorch/fleetfizz/commit/330d1f2cf177b6388a8fea7ac2b98879834baa90) Thanks [@connorch](https://github.com/connorch)! - The Ledger starts each item line with its status (`✓ done`, `▸ installing`, `· queued`, `✗ failed`, `– skipped`), all lowercase, in one set of columns. A Machine line ends with a colored summary of its items (`1 of 4 done`, `4 of 4 done`, `1 failed, 1 skipped`, `up to date`) instead of its own status, and a blank line separates Machines.

## 0.5.0

### Minor Changes

- [#13](https://github.com/connorch/fleetfizz/pull/13) [`37071da`](https://github.com/connorch/fleetfizz/commit/37071da62ffb897a1c84b901c1bf666c6e479425) Thanks [@connorch](https://github.com/connorch)! - The Ledger lists each Machine and what changes on it, live in a terminal (`f` shows every item). `fizz report` prints the full Ledger of the last Ship.

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
