Add an agent skill.

| Argument | Description |
| --- | --- |
| `<name>` | The skill, by the name its source gives it. |

| Flag | Description |
| --- | --- |
| `--config <path>` | The config file. Default: `$XDG_CONFIG_HOME/fleetfizz/config.jsonc`. |
| `--source <string>` | Where the skills CLI installs it from: `owner/repo` on GitHub, or any source `skills add` takes. Default: the GitHub repo the CLI installed it from here. Asked for when missing. |
| `--ref <string>` | A branch, tag, or full commit SHA. Default: the repo's default branch, or without `--source`, the ref the CLI installed it at here. |
| `--agent <id>` | An agent to install it for, as a skills CLI id (`claude-code`). Repeat the flag for more. For the first skill, they are the section's `agents`, picked from this Machine's when missing; after that, the skill's own. |
| `--platform <choice>` | Only Machines on this Platform. Repeat the flag for both. (choices: darwin, linux) |
| `--machine <machine>` | Only this Machine. Repeat the flag for more. |
