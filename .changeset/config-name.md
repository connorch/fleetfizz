---
"fleetfizz": minor
---

The config is `~/.config/fleetfizz/config.jsonc` and the schema next to it is `schema.json` (were `fleet.config.jsonc` and `fleet.schema.json`). Move the file on the Machine you ship from; the next Ship writes the new names everywhere else.
The first Ship after upgrading does not read the other Machines' old `fleet.config.jsonc`, so it cannot warn if one of them holds a newer config; ship from the Machine that shipped last.
