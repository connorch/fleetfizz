# One config at ~/.config/fleetfizz, copied to every Machine by every Ship

The config no longer lives in a repo (ADR 0004). It is `$XDG_CONFIG_HOME/fleetfizz/fleet.config.jsonc` (default `~/.config/fleetfizz/`) on every Machine, and a Ship copies the Starting Machine's copy to every reachable Machine as a Step, after the Lent Token on stdin, never in argv. The `machines` map in the config is the Fleet: only the Machines it lists are ever gathered or changed, and the Starting Machine must be one of them. fleetfizz is installed with `vp install -g fleetfizz` and pins itself implicitly: a Ship from version X plans `fleetfizz@X` on every Machine that runs a different version, so the whole Fleet converges on the shipper's version. A Machine that runs a newer fleetfizz than the shipper fails its plan ("upgrade here first") rather than being downgraded. A Machine without vp is bootstrapped with vp's installer (`curl -fsSL https://vite.plus | bash`) as its first Step.

The config carries `shippedAt` and `shippedFrom`, written by the Ship before it reads the config and before anything is copied. Gather reports every remote's `shippedAt`. When any remote's is newer than the local one, a Ship from elsewhere has happened that this Machine missed (it was offline), so continuing would overwrite a newer config with an older one; the Ship asks, and without a TTY it aborts unless `--overwrite-config` answered in advance. `shippedAt` is not an edit timestamp: nothing stamps the file when it is edited.

## Considered Options

- **Config in the user's repo, fleetfizz as that repo's devDependency (ADR 0004, superseded).** It made that repo special: it had to be cloned and installed on a Machine before that Machine could ship, and `pnpm ship` had to run from inside it. With every repo an ordinary Tracked Repo, the config has to live outside all of them.
- **`~/.config/fleetfizz` as a git clone that the Ship fetches and resets (rejected).** History and conflict detection for free, but it needs a config repo, a remote, and the Lent Token on every Machine just to read the config. The config is one small file; copying it is less machinery, and a user who wants history can keep the directory under git themselves without fleetfizz knowing.
- **Stamp the config only when its content changed (deferred).** Simpler to reason about: the stamp is set by every Ship, so every Ship copies the config to every Machine. Reconsider if that line in the ledger becomes noise.
- **fleetfizz listed in `globals` by the user (rejected).** A listed version can differ from the binary that read the config; the implicit pin cannot.
- **Downgrade a Machine that runs a newer fleetfizz (rejected).** A newer remote means someone shipped a newer version from there; the shipper is the one behind.

## Consequences

- Every Machine in the Fleet can be a Starting Machine as soon as one Ship has reached it: it has vp, fleetfizz, and the config.
- Amends ADR 0001's prerequisites: a remote Machine needs `tailscaled` with SSH, `git`, `curl`, and a shell. vp is no longer a prerequisite.
- Bootstrapping a new Machine is: enable Tailscale SSH, add it to `machines`, Ship.
- The Starting Machine's own config is rewritten by every real Ship (the two stamp keys change). A dry run stamps and copies nothing, and reports the staleness as INFO.
- `--config <path>` remains for one-off runs; the upward search from the working directory goes away.
- Machines on the tailnet that are not listed are ignored silently, and a listed name that is not on the tailnet is an error, as today.
