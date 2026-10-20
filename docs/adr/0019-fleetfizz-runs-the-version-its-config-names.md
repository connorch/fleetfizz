# fleetfizz runs the version its config names

A Ship pinned fleetfizz to the shipper's version as an implicit vp Global (ADR 0008), so every Machine that could start a Ship needed vp. fleetfizz now installs with any package manager the user picks (npm, pnpm, bun, or vp, ADR 0020), and the config says which version every Machine runs:

```jsonc
{ "version": "0.14.0", "machines": ["connors-mac-studio", "connors-macbook-pro"] }
```

- **`version` is an exact version, and required.** It is never a Range: one Ship's logic must be one version's. `fizz init` writes the running version. fleetfizz is not a Global in any package manager's section; the schema points to `version` instead.
- **Every fizz reads `version` first.** It reads it from the raw text, before the schema decodes anything, so a fizz of any version can read what a config of any version needs. The key never moves. A config that does not parse, or has no exact `version`, goes on to the command's own load, which says what is wrong (and `fizz config edit` opens it).
- **A fizz of another version switches before it does anything.** Every command that reads the config (`ship`, `status`, `init`, `config` and its edits) compares the two first. Older or newer, the config wins: fizz installs `fleetfizz@<version>` with the package manager that installed it, then runs the same command again with the `fizz` on PATH, with `FLEETFIZZ_SWITCHED` set so it never switches twice. When that fizz is still another version, the command stops and says to look at which `fizz` comes first on PATH. A fizz that no package manager fleetfizz knows installed (a `pnpm link`, a checkout), or an install that fails, stops with the command to run.
- **Which package manager installed a fizz is read from its paths**, the bin and the file behind it, in this order:

  | Path contains                             | Package manager |
  | ----------------------------------------- | --------------- |
  | `/vite-plus/packages/`, `/vite-plus/bin/` | vp              |
  | `/pnpm/`, `/.pnpm/`                       | pnpm            |
  | `/.bun/`, `/install/global/node_modules/` | bun             |
  | `/lib/node_modules/`                      | npm             |

  vp is first because vp's own Node keeps npm's Globals in a `lib/node_modules` too. A bin behind a mise or Volta shim is read through `mise which fizz` or `volta which fizz`, since the shim runs the tool's own bin.

- **fleetfizz is a Provider with one implicit Item, `fleetfizz:fleetfizz`, on every Machine**, the way Homebrew is `brew:brew`. It has no section and runs last, after every package manager a Ship installs. Its Check reads `command -v fizz`, the real path behind it, `fizz --version`, and which package managers are on PATH. A Machine whose fizz is another version gets `version` with the package manager that installed it there. A Machine whose fizz came from a package manager no longer on PATH fails with the command to run. A Machine without fizz gets it with the package manager that installed the Starting Machine's, read there the way its Check reads it, even with `--only` another Machine; it is skipped ("no pnpm here") when that package manager is not there and no section installs it in this Ship. The Starting Machine is always left as it is: it already switched.
- **The fizz Step and the config copy are independent.** Targets never run fizz during a Ship: the Starting Machine writes every script, so the gate there is the guarantee. Keeping the other Machines on `version` means `fizz status` shows one version everywhere and the next `fizz` there starts without an install. An old fizz that receives a newer config switches on its next run.
- **`fizz self-update [version]`** sets `version` in the config text (ADR 0017) to the given version or the newest published, installs it here with the same package manager, and says to ship. It is the one command that does not switch first: it changes the version, and edits only the raw text, so any fizz can run it. A fizz already at the version, updated by hand, only edits the config. The next Ship installs it everywhere. A schema change in the new version fails to load with an error that names what moved, which is fixed by hand before shipping.

## Considered Options

- **The implicit pin, installed with some package manager (rejected).** The shipper's binary would still decide, but a Ship would have to guess which package manager to use on each Machine with nothing in the config to say so.
- **fleetfizz as a plain Global with a Range (rejected).** Machines could ship with different logic, and a Range in one package manager's section cannot say which one installs it elsewhere.
- **`"fleetfizz": "self"` in one package manager's section (rejected).** A special value made fleetfizz look like any Global when it is the one thing a Ship cannot treat like one.
- **A standalone binary installed with curl (deferred).** `bun build --compile` builds the bundle for darwin and linux, arm64 and x64, unchanged (73 to 93 MB; darwin-x64 needs an ad-hoc re-sign). It would drop Node as a requirement for fizz. `version` stays the same contract if distribution changes later.
- **The fizz Step first on each target (rejected).** A target's fizz takes no part in its Ship, so first buys nothing, and on a new Machine the package manager that installs fizz may only arrive in that same Ship.

## Consequences

- Supersedes ADR 0008's implicit pin; the rest of ADR 0008 stands. "Upgrade here first" is gone: the config decides in both directions.
- A Machine where `self-update` ran holds an edited config, so a Ship of the older config from elsewhere asks before overwriting it (a Stale Config), even when that config uses a schema the older fizz cannot read. Using it here writes it and stops: the next `fizz ship` runs its version.
- A Machine needs Node and a package manager only to run fizz itself; one that only receives Ships needs neither.
