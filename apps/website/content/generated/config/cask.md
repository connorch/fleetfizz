Homebrew Casks, macOS only. Needs Homebrew on the Machine.

| Field | Description |
| --- | --- |
| `dependsOn` | Providers whose Items must succeed on a Machine before this one changes there. |
| `items` | Casks, each `"*"` or `"latest"`, or `{ range, platforms?, machines? }` to target one. A tapped name (`owner/tap/name`) taps on install. |
