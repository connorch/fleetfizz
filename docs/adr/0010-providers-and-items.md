# Providers and Items: one engine for every kind of thing a Ship keeps in line

A Ship knew two hard-coded sections, `vp` and `repos`, and each had its own path through Check, Plan, and Apply. Adding Homebrew Formulae and Casks that way would have meant a third and fourth copy of the same plumbing. There is now one engine (`packages/core`) and one Provider interface, and vp and repos are its first two Providers (`packages/providers`).

A **Provider** is one kind of thing a Ship keeps in line on a Machine, with its own config section. An **Item** is one entry of a Provider on one Machine, written `provider:item` (`vp:node`, `repos:connorch-t3code`) and split on the first `:`, as mise writes `npm:prettier`. The Ledger, `--rebuild`, and `--answer` all use the same address.

A Provider lists its Items (implicit ones too, like vp itself and the running fleetfizz), prints shell that observes them as `ff-state` Facts carrying its name, resolves what it needs once on the Starting Machine, decides each Item purely, and turns the decisions into Steps. A Decision is `leave`, `change`, `ask` (a Question), `skip`, or `fail`. A `leave` may still carry upkeep for its Steps: work that keeps the Item as it is, such as a Managed Clone's reset on every Ship (ADR 0002), which the Ledger does not count as a change. Every Provider follows one of two rules:

- **range**: the tool reports its own version, and the Item is kept inside a Range (ADR 0006). Nothing is stored. vp, Node, and Globals.
- **record**: the tool cannot say what is installed, so the Item is compared with its Install Record (commit, command, Files, Output fingerprints). Repos.

Everything that is the same for every Provider lives in the engine, written once:

- **Targeting**: `platforms` and `machines` on a section and on an Item, combined with AND. A Provider never filters by Machine. Globals gain per-Item Targeting (`{ "range", "platforms"?, "machines"? }`).
- **Records**: `~/.local/state/fleetfizz/records/<provider>/<item>.json`, read only for record Providers. The old `records/<repo>.json` is read when a repo has no new record, and the next install moves it, so nothing reinstalls after the upgrade.
- **Resolve**: once per Ship, on the Starting Machine, for the union of every checked Machine's Items. Repos now resolve a branch to a commit with `git ls-remote`, so every Machine gets the same commit in one Ship and a dry run shows `old → new`.
- **Questions** and their answers (ADR 0012).
- **dependsOn**, below.

## dependsOn

Dependencies are between Providers, not Items. A Provider declares the ones it always needs (repos need vp), and a section can add more (`"vp": { "dependsOn": [...] }`). Providers run in dependency order, with the built-in order breaking ties; a cycle is a config error that names the whole cycle.

On each Machine, a Provider is held back when a dependency has a failed Item there, or is held back itself. Its changes and Questions become skips with `depends on <provider>`. A dependency with no Items on that Machine (not targeted, say brew on linux) holds nothing back: if it did, one `dependsOn` line would quietly stop every linux Machine. Apply is one shell script per Machine, so failures at runtime hold back dependents in shell, with one flag per Provider; their Steps print skip lines instead of running. Within a Provider, a Step that shares an Item with a failed Step is skipped, as before.

## Considered Options

- **One module per section, as before (rejected).** Every new section repeats Targeting, records, Questions, and the Ledger, and they drift apart.
- **Item-level dependsOn (deferred, #24).** `brew:ffmpeg` before `repos:x` is more precise, but Provider-level covers every case in the config today. A failed Item holds back its whole Provider's dependents until then.
- **User-defined Providers now (deferred, #25).** Config-declared Providers (shell commands plus a rule) come first, then code plugins implementing the same interface. Building the interface around vp, repos, brew, and cask first keeps it honest.
- **Uninstalling removed Items (deferred, #26).** Removing an Item from the config never uninstalls it.
- **A failed dependency fails its dependents (rejected).** A skip with the reason says what happened and that nothing was tried.

## Consequences

- The Ledger and `fizz report` print addresses; `--rebuild <repo>` becomes `--rebuild repos:<repo>`.
- A Fact without a `provider` is the engine's (home, records, config, end); each Provider decodes its own Facts with its own Schema.
- A new Provider is one directory in `packages/providers`, one config section, and an entry in `PROVIDERS`.
