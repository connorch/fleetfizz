# Range rules for Globals

Each Global in the config has a package.json semver Range. A Ship installs the newest matching version when the Global is missing or below its Range, leaves it alone when it is anywhere inside its Range (even if a newer match exists), and asks a Question when it is above its Range. `latest` always installs the newest version, `*` installs only when missing, and a Global not in the config is ignored, never uninstalled. The newest matching version is resolved once, on the Starting Machine, so every Machine gets the same version in one Ship.

We chose this over "always upgrade within the Range" so that a Ship stays quiet: versions move only when a Global is missing, too old, or when someone bumps a Range on purpose. A Global above its Range usually means someone ran `vp update -g` by hand, and neither silently downgrading nor silently accepting it is right, so the Ship asks: bump the config's Range, skip it on that Machine, or downgrade into the Range.

## Consequences

- All Questions from all Machines are asked before any Machine changes.
- Without a TTY (an agent running the Ship), a Question is never waited on: the default is skip, with a SKIP line. `--bump` or `--enforce` answers every Question in advance.
- Skip is not remembered. The next Ship asks again.
- A Global installed on a different Node than the default is reinstalled at its installed version, not with `vp update -g --reinstall-node-mismatch`, which also upgrades every package to latest across majors.
