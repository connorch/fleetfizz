---
"fleetfizz": minor
---

The config moves to `~/.config/fleetfizz/fleet.config.jsonc` and `machines` is the Fleet. Every Ship stamps the config, copies it and the JSON Schema to every Machine, and installs its own fleetfizz version there; a Machine without vp is bootstrapped. A newer config on another Machine stops the Ship unless confirmed or `--overwrite-config`. The upward search from the working directory is gone; `--config` stays.
