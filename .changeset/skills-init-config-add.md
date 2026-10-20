---
"fleetfizz": minor
---

`fizz init` offers the skills the skills CLI installed from GitHub, with the agents to install them for, and adds the skills CLI as a Global when it is not picked. New: `fizz config add skills <name>`, whose source and ref default to the ones the CLI installed it from. Fixed: an object added to an object written on one line (a Tracked Repo, a skill with a ref) now spreads it over lines instead of breaking its indentation.
