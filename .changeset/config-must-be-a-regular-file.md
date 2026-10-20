---
"fleetfizz": patch
---

The config must be a regular file. A symlink at the config path, working or dangling, is refused by every command, and a Machine whose config is a symlink fails its Check, instead of a Ship or `fizz init` silently replacing the link with a regular file.
