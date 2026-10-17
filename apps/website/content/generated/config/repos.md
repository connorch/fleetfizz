Each Tracked Repo is cloned on every targeted Machine and installed from its origin ref.

| Field | Description |
| --- | --- |
| `origin` | The GitHub `owner/repo`. Required. |
| `ref` | A branch, or a full 40-character commit SHA to pin it. Required. |
| `install` | The Install Command, run in a login shell inside the Managed Clone. Required. |
| `name` | Names the clone's directory and the repo in output. Default: `<owner>-<repo>`. |
| `outputs` | Paths outside the clone the Install Command produces. If one changes by hand, the repo reinstalls. |
| `files` | Gitignored files written into the clone before every install, keyed by path. Never secrets. |
