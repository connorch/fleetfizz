---
"fleetfizz": patch
---

pnpm 11 and newer install Globals again: every script puts `PNPM_HOME/bin`, where they keep their Globals' commands, on PATH beside `PNPM_HOME`. Before, every pnpm Global failed with ERR_PNPM_GLOBAL_BIN_DIR_NOT_IN_PATH on a Machine whose pnpm is 11 or newer.
