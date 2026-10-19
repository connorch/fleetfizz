Agent skills, installed with the skills CLI, which `vp.items` must list. Kept at their source's ref.

| Field | Description |
| --- | --- |
| `dependsOn` | Providers whose Items must succeed on a Machine before this one changes there. |
| `agents` | The agents every skill is installed for, as skills CLI ids (`claude-code`, `codex`). An Item's own `agents` replaces this list. Required. |
| `items` | Skills, keyed by name, which names the `skills:<name>` Item. Each is a source, `{ source, ref?, agents?, platforms?, machines? }`, or a list of Variants, of which a Machine gets the first that targets it. |

Each skill in `items`:

| Field | Description |
| --- | --- |
| `source` | Where the skills CLI installs it from: `owner/repo` on GitHub, or any source `skills add` takes. Required. |
| `ref` | A branch, tag, or full commit SHA. Default: the repo's default branch. Not with a `source` that has `#ref`. |
| `agents` | The agents to install it for, instead of the section's `agents`. |
