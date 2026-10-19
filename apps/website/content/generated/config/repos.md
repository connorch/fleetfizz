Each Tracked Repo is cloned on every targeted Machine and installed from its origin ref.

| Field | Description |
| --- | --- |
| `dependsOn` | Providers whose Items must succeed on a Machine before this one changes there. |
| `cloneRoot` | Where a Machine keeps its Managed Clones: a path, or a list of `{ path, platforms?, machines? }` where a Machine gets the first that targets it. `~` expands on that Machine. Default: `~/.local/share/fleetfizz/clones`. |
| `items` | Tracked Repos, keyed by name, which names the Managed Clone and the `repos:<name>` Item. Each is `{ origin, ref, install, ... }`, or a list of Variants, of which a Machine gets the first that targets it. |

Each Tracked Repo in `items`:

| Field | Description |
| --- | --- |
| `origin` | The GitHub `owner/repo`. Required. |
| `ref` | A branch, or a full 40-character commit SHA to pin it. Required. |
| `install` | The Install Command, run in a login shell inside the Managed Clone. Required. |
| `outputs` | Paths outside the clone the Install Command produces. If one changes by hand, the repo reinstalls. |
