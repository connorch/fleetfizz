---
"fleetfizz": patch
---

A skill from a repo too large for GitHub to list in full is skipped as one fizz could not check, like when GitHub cannot be reached, instead of installing again on every Ship as "not found". Skills install and are checked with `core.autocrlf` off, so a Machine whose git config converts line endings no longer asks whether an unedited skill was edited there. On a Machine with `core.autocrlf=true`, a skill installed before this may be asked about once: overwrite it.
