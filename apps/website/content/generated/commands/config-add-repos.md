Add a Tracked Repo.

| Argument | Description |
| --- | --- |
| `<origin>` | The GitHub `owner/repo`. |

| Flag | Description |
| --- | --- |
| `--config <path>` | The config file. Default: `$XDG_CONFIG_HOME/fleetfizz/config.jsonc`. |
| `--name <string>` | The Item's name. Default: the repo's name. |
| `--ref <string>` | A branch or a full commit SHA. Default: the origin's default branch. |
| `--install <string>` | The Install Command. Asked for when missing. |
| `--output <path>` | A path outside the clone the Install Command produces. Repeat the flag for more. |
| `--platform <choice>` | Only Machines on this Platform. Repeat the flag for both. (choices: darwin, linux) |
| `--machine <machine>` | Only this Machine. Repeat the flag for more. |
