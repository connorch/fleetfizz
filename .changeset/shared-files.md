---
"fleetfizz": minor
---

Shared Files: a new `files` section copies files and directories (configs like Karabiner's, or ones that hold secrets) from the Machine you ship from to every targeted Machine, with their modes. A directory is mirrored, `exclude` leaves paths alone, and a Ship asks before overwriting a copy that was edited there, that no Ship wrote, or that came from a newer Ship. Contents travel only on the ssh session's stdin, never in a script or a log.
