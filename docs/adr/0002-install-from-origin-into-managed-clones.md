# Install Tracked Repos from origin into Managed Clones

Every Tracked Repo installs from its origin ref, on every Machine, from a Managed Clone that fleetfizz owns and resets (`git reset --hard`, then `git clean -fd`) on every Ship. Ignored files such as `node_modules` and build caches survive the clean, so installs stay incremental. There is no special case for the Starting Machine, and fleetfizz never uses or modifies a developer's own clones. The config is read from the working copy where fleetfizz runs (like Terraform), but nothing is installed from it.

## Considered Options

- **The Starting Machine installs its working copy (rejected).** This was the old rule. A Ship from a feature branch would install that branch's app by accident.
- **Build in the developer's own clones, fast-forward only, refuse when dirty (rejected).** Needs per-Machine paths and dirty/diverged checks, and refuses often. Managed Clones are always consistent.

## Consequences

- To test a local change, run the repo's Install Command in your own checkout by hand. The next Ship puts origin back only if the commit changed or `--rebuild` is passed, because fleetfizz cannot detect a hand install.
- The Install Command runs only when the Install Record (commit, Managed Clone path, Install Command hash) differs from the last success on that Machine. A failed install keeps the old record, so the next Ship retries.
- If the Clone Root does not exist, its repos fail. fleetfizz never falls back to the internal drive, which would silently re-clone gigabytes there (the Mac Studio's Clone Root is an external SSD).
- fleetfizz never deletes: not Managed Clones, not Globals. Removing an entry from the config only stops managing it.
- A stable path to a Managed Clone is the Install Command's job (`ln -sfn "$PWD" <path>`), not a fleetfizz feature.
