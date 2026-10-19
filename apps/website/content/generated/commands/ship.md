Ship the config to every reachable Machine.

| Flag | Description |
| --- | --- |
| `--dry-run` | Check and plan only. Print every Machine's plan and change nothing. |
| `--only <machine>` | Ship only to this Machine. Repeat the flag for more. |
| `--rebuild <item>` | Rebuild a record Item (`repos:<name>`, `skills:<name>`) even when it is up to date. `all` for every one. |
| `--answer <answer>` | Answer a Question in advance: `kind=choice` or `kind:subject=choice`. Repeat the flag for more. |
| `--bump` | Answer every above-range Question by bumping the config (`--answer range=bump`). |
| `--enforce` | Answer every above-range Question by downgrading into the Range (`--answer range=downgrade`). |
| `--overwrite-config` | Ship even when another Machine holds a newer config, overwriting it (`--answer config=overwrite`). |
| `--config <path>` | The config file. Default: `$XDG_CONFIG_HOME/fleetfizz/config.jsonc`. |
