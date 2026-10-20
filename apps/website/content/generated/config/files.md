Files and directories copied from the Starting Machine to every targeted Machine. A directory is mirrored.

| Field | Description |
| --- | --- |
| `dependsOn` | Providers whose Items must succeed on a Machine before this one changes there. |
| `items` | Shared Files, keyed by name, which names the `files:<name>` Item. Each is a path, `{ path, exclude?, after?, platforms?, machines? }`, or a list of Variants, of which a Machine gets the first that targets it. |

Each Shared File in `items`:

| Field | Description |
| --- | --- |
| `path` | A file or directory, absolute or under `~`, which expands on each Machine. Required. |
| `exclude` | Globs inside a directory that are neither copied nor deleted. One without a `/` matches a name at any depth. `.DS_Store` and `._*` are always excluded. Every Variant of one Shared File has the same exclude. |
| `after` | A command run after a Ship writes the file there, in its directory, with shell.init and the known bin directories set up (`mise install`). If it fails, the next Ship runs it again. |
