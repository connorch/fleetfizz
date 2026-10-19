---
"fleetfizz": minor
---

Breaking: a Tracked Repo's `files` is gone. Write gitignored files from the Install Command instead, which also fits anything custom, like secrets from a password manager: `"install": "echo A=1 > .env && npm ci"`. A config that still has `files` fails to load.
