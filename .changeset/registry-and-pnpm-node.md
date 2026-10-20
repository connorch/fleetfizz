---
"fleetfizz": patch
---

Fixed: `fizz self-update`, `fizz config add` for a Global, and a Ship's Globals read published versions from the npm registry directly, so they work on a Machine without npm. A fizz installed with npm under a Node from `pnpm env use` is now updated with npm, not pnpm.
