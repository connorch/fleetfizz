# Install Tracked Repos from origin into Managed Clones

Every Tracked Repo installs from its origin ref, on every Machine, from a Managed Clone that fleetfizz owns and resets (`git reset --hard`, then `git clean -fd`) on every Ship. Ignored files such as `node_modules` and build caches survive the clean, so installs stay incremental. There is no special case for the Starting Machine, and fleetfizz never uses or modifies a developer's own clones. The config is read from the working copy where fleetfizz runs (like Terraform), but nothing is installed from it.

## Considered Options

- **The Starting Machine installs its working copy (rejected).** This was the old rule. A Ship from a feature branch would install that branch's app by accident.
- **Build in the developer's own clones, fast-forward only, refuse when dirty (rejected).** Needs per-Machine paths and dirty/diverged checks, and refuses often. Managed Clones are always consistent.

## Consequences

- The Install Command runs only when the Install Record (commit, Managed Clone path, Install Command hash, Files, and Output fingerprints) differs from the last success on that Machine. A failed install keeps the old record, so the next Ship retries.
- A Tracked Repo may declare Outputs, the paths its Install Command produces. Their fingerprints (symlink target, file hash, or directory tree hash) are stored in the Install Record and checked on every Ship, so a hand install from a developer's own clone counts as Drift and the next Ship restores origin. Repos without Outputs rely on the commit alone, and `--rebuild` is the manual override.
- A Tracked Repo may declare Files, gitignored files written into the Managed Clone before every install (an `.env`). Their content is public config, never a secret.
- If the Clone Root does not exist, its repos fail. fleetfizz never falls back to the internal drive, which would silently re-clone gigabytes there (the Mac Studio's Clone Root is an external SSD).
- fleetfizz never deletes: not Managed Clones, not Globals. Removing an entry from the config only stops managing it.
- A stable path to a Managed Clone is the Install Command's job (`ln -sfn "$PWD" <path>`), not a fleetfizz feature.
