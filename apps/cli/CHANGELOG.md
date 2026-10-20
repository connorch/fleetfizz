# fleetfizz

## 0.14.0

### Minor Changes

- [#68](https://github.com/connorch/fleetfizz/pull/68) [`3a5d1c3`](https://github.com/connorch/fleetfizz/commit/3a5d1c3b44a1e58b9ab1aa523843e754db0ddce5) Thanks [@connorch](https://github.com/connorch)! - fleetfizz no longer needs vite-plus. `vp`, `npm`, `bun`, and `pnpm` are equal sections that keep their Globals in line, and a Ship never installs or versions a package manager or Node: keep them as a Global of another package manager, a Formula, or a Shared File. Breaking: the config needs a top-level exact `version`, the fleetfizz every Machine runs; a fizz of another version installs it with the package manager that installed fizz and runs the command again. `vp.version`, `vp.node`, and the package-manager keys are gone, and so is the managed-mode Question. New: `fizz self-update [version]`, `fizz config add npm|bun|pnpm`, `after` on a Shared File (runs after a Ship writes it), and `shell.init`. Sections run in a fixed built-in order, and only `dependsOn` holds one back, so repos no longer wait on vp.

### Patch Changes

- [#72](https://github.com/connorch/fleetfizz/pull/72) [`cfe0a37`](https://github.com/connorch/fleetfizz/commit/cfe0a37c858294ad26a9ea0ff30046b00bb0695e) Thanks [@connorch](https://github.com/connorch)! - The npm page now has a README, a homepage link to fleetfizz.com, and keywords.

## 0.13.0

### Minor Changes

- [#65](https://github.com/connorch/fleetfizz/pull/65) [`cbeed50`](https://github.com/connorch/fleetfizz/commit/cbeed5057eb27192eb14c0e5d08445f579bb9b0b) Thanks [@connorch](https://github.com/connorch)! - New `skills` section: agent skills, installed on every targeted Machine with the skills CLI (list it in `vp.items`) for the agents you name. A skill from GitHub is kept at its ref, or the default branch: when its folder's hash moves there, the next Ship installs it again. A Ship asks before an install replaces a skill folder that was edited there or that the skills CLI did not install (`--answer skill=overwrite|skip`), and `--rebuild skills:<name>` installs one again. Private sources use the same gh token as private repos.

## 0.12.0

### Minor Changes

- [#60](https://github.com/connorch/fleetfizz/pull/60) [`32d5635`](https://github.com/connorch/fleetfizz/commit/32d56358ec44dd9f188fbc881491f6ffd9c15138) Thanks [@connorch](https://github.com/connorch)! - New `fizz config` commands. `fizz config` shows each Provider's Items, the Targeting on each, and when a Ship last reached each Machine. `fizz config add machines|vp|brew|cask|repos|files` adds a Machine or an Item, `fizz config remove <provider:item>` removes one, and `fizz config edit` opens the config in your editor. Every edit keeps the config's comments and layout, and is saved only when the config still loads.

- [#62](https://github.com/connorch/fleetfizz/pull/62) [`0902e2f`](https://github.com/connorch/fleetfizz/commit/0902e2f493cb035264c35fa02efc04e0596ba73f) Thanks [@connorch](https://github.com/connorch)! - New `fizz init`: checks that this Machine can ship (vp, Tailscale connected with Tailscale SSH, and Homebrew and `gh` when needed) and prints the fix for each problem, then asks which Machines on the tailnet are in the Fleet, whether to pin vp and Node, and which Globals, Formulae, Casks, and common dotfiles to keep in line, and writes the config and `schema.json`. Getting started and its setup prompt now use it. A missing config now says to run `fizz init`.

- [#61](https://github.com/connorch/fleetfizz/pull/61) [`13e53a0`](https://github.com/connorch/fleetfizz/commit/13e53a0ed09217aede53b790ed15574923951020) Thanks [@connorch](https://github.com/connorch)! - New `fizz status`: checks every reachable Machine and shows where each Item stands, in line, to change, a Question, or failing, with a column per Machine and what differs on each. It plans like `fizz ship --dry-run`, changes nothing, asks nothing, and writes no Ship Log. `fizz config` points to it.

## 0.11.0

### Minor Changes

- [#59](https://github.com/connorch/fleetfizz/pull/59) [`b8a3658`](https://github.com/connorch/fleetfizz/commit/b8a36583c8ce67bab88eb3ee95c42caa0a5c6c54) Thanks [@connorch](https://github.com/connorch)! - A Question about overwriting a Shared File can show the diff from that Machine's copy first, in your own git pager, then asks again. Only the files that differ cross, encrypted as in a pull, and the diff never reaches the Ledger or the Ship Log.

### Patch Changes

- [#56](https://github.com/connorch/fleetfizz/pull/56) [`3f49eb8`](https://github.com/connorch/fleetfizz/commit/3f49eb8bb8a7ab5487133a01b6c40d8200f27af0) Thanks [@connorch](https://github.com/connorch)! - The Ledger draws every unchanged item the same way: dim, with no "up to date" label, including a Tracked Repo whose fetch ran and the config when nothing changed.

## 0.10.0

### Minor Changes

- [#53](https://github.com/connorch/fleetfizz/pull/53) [`932a05e`](https://github.com/connorch/fleetfizz/commit/932a05e0cb8a16ced27577c64a1dcb7b2a065afc) Thanks [@connorch](https://github.com/connorch)! - The config no longer carries `shippedAt`, `shippedFrom`, and `shippedTo`, and a Ship no longer rewrites it. Each Machine keeps that history in an Install Record instead (`~/.local/state/fleetfizz/records/config.json`), so a Ship also asks before overwriting a config edited on another Machine. The Ledger's `config` line shows a change only where a Machine's copy differs.
  
  A config that still has the three keys fails to load: delete them. Another Machine's copy that still has them is overwritten by the next Ship without a Question, so ship from the Machine with the newest config first.

- [#52](https://github.com/connorch/fleetfizz/pull/52) [`98eceb2`](https://github.com/connorch/fleetfizz/commit/98eceb2f49a076651113519894e9ef835a0d9b4b) Thanks [@connorch](https://github.com/connorch)! - Shared Files can be pulled: when the Machine you ship from lacks a Shared File, the Ship asks which other Machine's copy to take, and a Question about overwriting an edited copy can keep that copy instead. The copy comes back encrypted with a one-time key (`openssl` on the other Machine), is written here, and the Ship starts over from it.

- [#51](https://github.com/connorch/fleetfizz/pull/51) [`46d13ce`](https://github.com/connorch/fleetfizz/commit/46d13ce0923f896c923538cacba2d3dad10a1d75) Thanks [@connorch](https://github.com/connorch)! - Shared Files: a new `files` section copies files and directories (configs like Karabiner's, or ones that hold secrets) from the Machine you ship from to every targeted Machine, with their modes. A directory is mirrored, `exclude` leaves paths alone, and a Ship asks before overwriting a copy that was edited there, that no Ship wrote, or that came from a newer Ship. Contents travel only on the ssh session's stdin, never in a script or a log.

### Patch Changes

- [#54](https://github.com/connorch/fleetfizz/pull/54) [`7fc5919`](https://github.com/connorch/fleetfizz/commit/7fc59199b591daf7faf3a2a82aecfc1dd8b92f8a) Thanks [@connorch](https://github.com/connorch)! - `fleetfizz` is now an alias of the `fizz` command.

## 0.9.1

### Patch Changes

- [#49](https://github.com/connorch/fleetfizz/pull/49) [`2ee1897`](https://github.com/connorch/fleetfizz/commit/2ee18970b5db8ca1627da374f46ca4c69d967ecb) Thanks [@connorch](https://github.com/connorch)! - The live Ledger always says what is running: a Machine shows `connecting` until ssh is up, then `checking`, `✓ checked`, and `applying`; a Step for an item that does not change (a repo's upkeep fetch) shows its item while it runs; and Resolve shows as a line under the Machines.

- [#49](https://github.com/connorch/fleetfizz/pull/49) [`123954f`](https://github.com/connorch/fleetfizz/commit/123954fa7feca18cd10f38cdca73d65886ad9e7f) Thanks [@connorch](https://github.com/connorch)! - A Tracked Repo whose Managed Clone is already at the resolved commit is no longer fetched on every Ship; it is still reset and cleaned. A Ship that changes nothing is several seconds faster per Machine, and no longer fails when GitHub is briefly unreachable from a Machine with nothing to update.

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
