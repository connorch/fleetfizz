Remove an Item or a Machine from the config. A Ship never uninstalls what it removes.

| Argument | Description |
| --- | --- |
| `<item>` | `provider:item` (`brew:tmux`, `pnpm:vercel`), or `machines:<name>` to take a Machine out of the Fleet. |

| Flag | Description |
| --- | --- |
| `--config <path>` | The config file. Default: `$XDG_CONFIG_HOME/fleetfizz/config.jsonc`. |
