Homebrew Formulae. Needs Homebrew on the Machine; a Ship never installs it.

| Field | Description |
| --- | --- |
| `dependsOn` | Providers whose Items must succeed on a Machine before this one changes there. |
| `items` | Formulae, keyed by name. Each is `"*"` or `"latest"`, `{ range, platforms?, machines? }` to target it, or a list of Variants, of which a Machine gets the first that targets it. A tapped name (`owner/tap/name`) taps on install. |
