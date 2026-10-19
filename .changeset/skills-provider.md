---
"fleetfizz": minor
---

New `skills` section: agent skills, installed on every targeted Machine with the skills CLI (list it in `vp.items`) for the agents you name. A skill from GitHub is kept at its ref, or the default branch: when its folder's hash moves there, the next Ship installs it again. A Ship asks before an install replaces a skill folder that was edited there or that the skills CLI did not install (`--answer skill=overwrite|skip`), and `--rebuild skills:<name>` installs one again. Private sources use the same gh token as private repos.
