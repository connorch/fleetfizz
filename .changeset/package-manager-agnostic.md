---
"fleetfizz": minor
---

fleetfizz no longer needs vite-plus. `vp`, `npm`, `bun`, and `pnpm` are equal sections that keep their Globals in line, and a Ship never installs or versions a package manager or Node: keep them as a Global of another package manager, a Formula, or a Shared File. Breaking: the config needs a top-level exact `version`, the fleetfizz every Machine runs; a fizz of another version installs it with the package manager that installed fizz and runs the command again. `vp.version`, `vp.node`, and the package-manager keys are gone, and so is the managed-mode Question. New: `fizz self-update [version]`, `fizz config add npm|bun|pnpm`, `after` on a Shared File (runs after a Ship writes it), and `shell.init`. Sections run in a fixed built-in order, and only `dependsOn` holds one back, so repos no longer wait on vp.
