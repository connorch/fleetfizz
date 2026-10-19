---
"fleetfizz": minor
---

New `fizz config` commands. `fizz config` shows each Provider's Items, the Targeting on each, and when a Ship last reached each Machine. `fizz config add machines|vp|brew|cask|repos|files` adds a Machine or an Item, `fizz config remove <provider:item>` removes one, and `fizz config edit` opens the config in your editor. Every edit keeps the config's comments and layout, and is saved only when the config still loads.
