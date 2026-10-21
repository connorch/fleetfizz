---
"fleetfizz": patch
---

Only your own user can read the Ship Log and the saved Ledger: every Ship makes `~/.local/state/fleetfizz` owner-only (0700), existing installs included, and writes new Ship Logs and `last-ship.json` as 0600. Before, both were world-readable, along with everything an Install Command printed.
