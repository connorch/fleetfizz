Homebrew Formulae. Needs Homebrew on the Machine; a Ship never installs it.

| Field | Description |
| --- | --- |
| `dependsOn` | Providers whose Items must succeed on a Machine before this one changes there. |
| `items` | Formulae, each `"*"` or `"latest"`, or `{ range, platforms?, machines? }` to target one. A tapped name (`owner/tap/name`) taps on install. |
