Files and directories copied from the Starting Machine to every targeted Machine. A directory is mirrored.

| Field | Description |
| --- | --- |
| `dependsOn` | Providers whose Items must succeed on a Machine before this one changes there. |
| `items` | Shared Files, keyed by name, which names the `files:<name>` Item. Each is a path, `{ path, exclude?, platforms?, machines? }`, or a list of Variants, of which a Machine gets the first that targets it. |

Each Shared File in `items`:

| Field | Description |
| --- | --- |
| `path` | A file or directory, absolute or under `~`, which expands on each Machine. Required. |
| `exclude` | Globs inside a directory that are neither copied nor deleted. One without a `/` matches a name at any depth. `.DS_Store` and `._*` are always excluded. |
