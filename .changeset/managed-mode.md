---
"fleetfizz": minor
---

The `vp` section keeps package managers' defaults beside Node: `"vp": { "pnpm": "^10", "yarn": "^4" }`, for `npm`, `pnpm`, `yarn`, and `bun`. These need vp in managed mode, so a Machine in system-first mode gets a Question: switch every tool to managed mode, or skip its Node and package-manager defaults (the default without a terminal). `--answer mode=managed` switches in advance. A Global can no longer be named after a package manager or `mode`.
