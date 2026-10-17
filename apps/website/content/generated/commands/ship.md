Ship the config to every reachable Machine.

| Flag | Description |
| --- | --- |
| `--dry-run` | Check and plan only. Print every Machine's plan and change nothing. |
| `--only <machine>` | Ship only to this Machine. Repeat the flag for more. |
| `--rebuild <repo>` | Run a repo's Install Command even when nothing changed. `all` for every repo. |
| `--bump` | Answer every above-range Question by bumping the config. |
| `--enforce` | Answer every above-range Question by downgrading into the Range. |
| `--overwrite-config` | Ship even when another Machine holds a newer config, overwriting it with this one. |
| `--config <path>` | The config file. Default: `$XDG_CONFIG_HOME/fleetfizz/config.jsonc`. |
