Print the Ship Log of a Ship: every script, every line each Machine printed, and every decision. Without a Ship id, the latest Ship that started on or reached this Machine, read over tailscale ssh when another Machine started it.

| Argument | Description |
| --- | --- |
| `<ship>` (optional) | The Ship id, printed at the end of every Ship. |

| Flag | Description |
| --- | --- |
| `--machine <machine>` | Print only this Machine's lines. |
| `--list` | List the Ships started here whose logs this Machine keeps (its last 20). |
