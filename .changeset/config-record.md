---
"fleetfizz": minor
---

The config no longer carries `shippedAt`, `shippedFrom`, and `shippedTo`, and a Ship no longer rewrites it. Each Machine keeps that history in an Install Record instead (`~/.local/state/fleetfizz/records/config.json`), so a Ship also asks before overwriting a config edited on another Machine. The Ledger's `config` line shows a change only where a Machine's copy differs.

A config that still has the three keys fails to load: delete them. Another Machine's copy that still has them is overwritten by the next Ship without a Question, so ship from the Machine with the newest config first.
