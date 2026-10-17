---
"fleetfizz": minor
---

New `brew` and `cask` Providers keep Homebrew Formulae and Casks on every Machine: `"brew": { "items": { "gh": "*", "oven-sh/bun/bun": "latest" } }`. `"*"` installs when missing; `"latest"` runs `brew update`, then upgrades on every Ship, and the Ledger shows the version it reached. A Ship never installs Homebrew itself: `brew:brew` fails on a Machine without it.
