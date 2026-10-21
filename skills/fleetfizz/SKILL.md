---
name: fleetfizz
description: Keeps the user's Machines in line with fleetfizz (`fizz`). Use when asked to add, remove, or change what the Fleet installs (packages, Formulae, Casks, skills, files, repos), to ship the config to their Machines, or to find out why a Ship failed or where a Machine stands.
---

# fleetfizz

fleetfizz keeps every Machine in the Fleet (the Machines on a Tailscale tailnet that the Config lists) in line with one Config. `fizz ship` runs here, on the Starting Machine, and drives the others over `tailscale ssh`. Every Item has an address, `provider:item` (`brew:tmux`, `pnpm:vercel`, `repos:t3code`, `files:vaut`).

Each Machine runs the fleetfizz `version` its Config names, so flags and config fields come from `fizz <command> --help` and the config's `$schema`, which always match it.

You have no terminal, and fleetfizz prompts only in one: pass every argument a command would ask for. Setting fleetfizz up is the user's, in a terminal: when `fizz` is missing or there is no config, point them to `npm install -g fleetfizz` and `fizz init`.

## Change the config

1. Use `fizz config add <provider> ...` or `fizz config remove <provider:item>` when they make the change: they keep the file's layout and comments, and save only a config that loads. Give every argument (`add machines <names>`, `add repos <origin> --install <command>`), so nothing prompts.
2. Make any other change (an existing Item, Variants, section settings like `dependsOn` or `agents`) by editing the JSONC at `fizz config path` directly, in the layout and with the comments it already has.
3. Run `fizz config`. Done when it loads and each changed Item targets exactly the Machines the user meant.

Targeting: an Item's `platforms` and `machines` combine with its section's by AND, and an unset field means every one. An Item can be a list of Variants, and a Machine gets the first Variant that targets it, so the narrowest goes first.

Removing an Item stops fleetfizz keeping it; whatever it installed stays on every Machine. Say so when the user asks to remove something.

When the user wants the change on their Machines, go on to Ship.

## Ship

1. Run `fizz ship --dry-run`, with `--only <machine>` only when the user asks to ship to just those Machines. Targeting already decides which Machines get an Item, and every Machine a Ship skips keeps the old config.
2. Collect every Question in the plan. Each is a `?` line, `? pnpm:vercel 60.1.0 on connors-macbook-pro is above ^59.25.4`, then `→ not asked (dry run)`. A Ship without a terminal answers each `range`, `file`, and `skill` Question with its default, skip, so every Question goes to the user: what it found, where, and the choices.

   | Kind     | Asked when                                      | Subject         | Choices               |
   | -------- | ----------------------------------------------- | --------------- | --------------------- |
   | `range`  | a Global is above its Range                     | `pnpm:vercel`   | bump, skip, downgrade |
   | `file`   | a target's copy was edited, or no Ship wrote it | `files:<name>`  | overwrite, skip       |
   | `skill`  | an install would replace a skill folder         | `skills:<name>` | overwrite, skip       |
   | `config` | another Machine's config is newer or edited     | the Machine     | overwrite, stop       |

   A `config` Question shows instead as a line that `a Ship would ask before overwriting it`, and stops a Ship without a terminal. A terminal offers more: adopting that Machine's config here (`config`), or a diff, keeping the target's copy, and pulling a Shared File the Starting Machine lacks (`file`). When the user wants one of those, they run `fizz ship` themselves.

3. Run `fizz ship` with one `--answer kind:subject=choice` per Question, as the user decided (`--answer range:pnpm:vercel=bump --answer config:connors-macbook-pro=overwrite`). The blanket forms (`--answer kind=choice`, `--bump`, `--enforce`, `--overwrite-config`) are for when the user asks for that behavior across the Fleet by name.
4. Done when you have told the user each Machine's result: what changed, what failed, and what was skipped (an offline Machine is skipped and catches up on the next Ship), with the Ship id the Ship prints at its end. An Item skipped with `ship again` waits for a package manager or the skills CLI this Ship installed: ship again. A failure goes on to Debug.

`--rebuild repos:<name>` installs a Tracked Repo again when its commit has not moved (`skills:<name>` a skill, `files:<name>` runs a Shared File's `after` again).

## Debug

- `fizz status`: where every Item stands on every reachable Machine now, with `?` for a Question. Changes nothing and asks nothing.
- `fizz logs [<ship-id>] [--machine <machine>]`: the Ship Log, with every script each Machine ran, every line it printed, and full errors. Without an id, the latest Ship that started on or reached this Machine; `--list` lists ids.
- `fizz report`: the full Ledger of the last Ship from this Machine.

Done when, for every failing Item, you can name the Machine, quote the error from the Ship Log, and give the fix: a change to the config (Change the config) or something the user does on that Machine.
