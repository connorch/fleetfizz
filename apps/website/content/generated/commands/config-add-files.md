Add a Shared File.

| Argument | Description |
| --- | --- |
| `<path>` | A file or directory on this Machine. |

| Flag | Description |
| --- | --- |
| `--config <path>` | The config file. Default: `$XDG_CONFIG_HOME/fleetfizz/config.jsonc`. |
| `--name <string>` | The Item's name. Default: the last part of the path, without a leading dot. |
| `--exclude <glob>` | A glob inside a directory that is not copied. Repeat the flag for more. |
| `--platform <choice>` | Only Machines on this Platform. Repeat the flag for both. (choices: darwin, linux) |
| `--machine <machine>` | Only this Machine. Repeat the flag for more. |
