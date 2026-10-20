---
status: amended by ADR-0020 (the skills CLI is a Global of any package manager)
---

# Skills: installed with the skills CLI, kept at their source's ref

Agent skills need to be the same on every Machine, and each agent harness (Claude Code, Codex, and some 70 others) reads them from its own folder, with its own rules for links and copies. The [skills CLI](https://github.com/vercel-labs/skills) already knows every harness, so the `skills` Provider does not: it runs `skills add` and reads what the CLI recorded.

```jsonc
"vp": { "items": { "skills": "^1.7.0" } },
"skills": {
  "agents": ["claude-code", "codex"],
  "items": {
    "grilling": "mattpocock/skills",
    "find-skills": { "source": "vercel-labs/skills", "ref": "v2", "agents": ["claude-code"] }
  }
}
```

- **An Item is a skill, keyed by its name**, as in the CLI's lock, with the CLI's words: `source` (any source `skills add` takes), `ref`, and `agents` (the CLI's agent ids). A string is shorthand for `{ source }`. A `source` with `#ref` and a `ref` both is an error, as in the CLI's own package.json format. Targeting and Variants work as in every section (ADR 0014).
- **`agents` is required on the section.** Without `-a`, the CLI installs for the agents it detects on each Machine, and for every agent it knows when it detects none. An Item's `agents` replaces the section's; the lists are never merged. An unknown id fails the Item with the CLI's own message.
- **The CLI is a vp Global the user lists**, so its version is a Range like any other and `skills` depends on `vp`. Without it, every skill fails with "add skills to vp.items"; on a Machine where vp installs it in this Ship, skills are skipped until the next Ship, whose Check can see their folders through the CLI.
- **The CLI's lock is most of the Install Record.** `~/.agents/.skill-lock.json` (or under `$XDG_STATE_HOME`) holds each skill's source, ref, path in its repo, and, for a GitHub source, the git tree hash of its folder. fleetfizz never writes it or a skill's folder, so `skills ls` and `skills update` still work on every Machine. What the lock lacks is the agents a skill was installed for, and `skills ls` reports agents only for the ones it detects on that Machine. So after each install, fleetfizz writes its own Install Record, `records/skills/<name>.json`, holding just those agents. As a record Provider, `skills` takes `--rebuild skills:<name>`.
- **A GitHub skill follows its ref, like a Tracked Repo.** Once per Ship, the Starting Machine reads each `owner/repo` at its ref (or default branch) from GitHub's trees API, one call per repo and ref, and takes each skill folder's hash from it. A Machine whose lock has another hash or another source or ref installs it again, as does one whose Install Record lacks a configured agent, or that has no Install Record (the first Ship after the CLI installed it by hand). An agent dropped from the config keeps the skill: nothing is uninstalled. The install names the configured ref, not the commit it resolved to, so the lock keeps the ref. A Ship that runs while upstream moves can leave two Machines on different commits until the next Ship. Any other source (a URL, a path, an `owner/repo/path`) is installed when missing and never checked.
- **GitHub not answering is not a failure.** An installed skill is skipped for that Ship ("could not check owner/repo: ..."), and a missing one still installs.
- **Before the CLI replaces a folder, a Ship may ask.** `skills add` deletes a folder of the same name without asking. A `skill` Question (overwrite or skip, skip by default) comes first when the folder was edited there (its git tree hash, taken in the Check with `git write-tree`, no longer matches the lock), or when the lock has no entry for it, such as a skill a Tracked Repo installs. Edits are detected only for GitHub sources, whose lock hash is a tree hash.
- **One `skills add` per source, ref, and agents** on each Machine, so a repo is cloned once for all its skills: `skills add <source> -g -y --json -s <names> -a <agents>`. Its JSON result, not its exit code (which can be 0 after a partial failure without `--json`), says which skills it installed for every agent; only those get an Install Record and the hash they reached, read back from the lock for the Ledger (`skills:grilling eedaf25 → f073203`). Any other fails the Step, and the next Ship installs it again.
- **The Check runs a small Node program.** It needs the CLI's JSON (the lock, and `skills ls -g -a <agents> --json`, which finds each folder wherever the CLI put it and rejects an unknown agent id), which shell cannot parse reliably, and the CLI already needs Node.
- **Never telemetry.** Every CLI run has `DISABLE_TELEMETRY=1`: a Ship is not a new install of a skill on every Machine.
- **The Lent Token reaches the CLI** (ADR 0003): GitHub's API reads it as `GH_TOKEN`, and the git it runs to clone gets the same credential helper as `ff_git`, for that one process. The Starting Machine reads the trees API with it too, so private skills resolve.
- **`skills` runs after the Homebrew packages and before repos**, so an Install Command can use a skill from the same Ship.

## Considered Options

- **Shared Files for `~/.agents/skills` and `~/.claude/skills` (rejected).** Links between the two land fine, but a directory is mirrored: sharing some skills means one Item per skill and one more per agent link, and the lock cannot be shared in part.
- **Keyed by source, like the CLI's package.json field (rejected).** `"mattpocock/skills": ["grilling"]` repeats less, but the Item becomes a repo: the Ledger shows `skills:mattpocock/skills`, and Targeting cannot pick one skill.
- **A Provider that runs any command (rejected).** It has nothing to check, so it runs on every Ship and cannot ask before replacing anything.
- **`"*"` or `"latest"`, like Homebrew (rejected).** `latest` would install every skill again on every Ship, since only the CLI's `update` knows whether something is newer, and each Machine would resolve upstream on its own.
- **Install the resolved commit (rejected).** Every Machine would match exactly, but every lock would pin a commit, and `skills update` by hand would never update anything.
- **`skills update` (rejected).** Without `-a` it installs into every agent it can find, and it cannot report what it would change.

## Consequences

- A skill the user wrote and keeps in their own repo is better as a Tracked Repo whose Install Command runs `skills add .`: the Lent Token clones it, and its record is the commit. Such skills are never listed here, or the two would replace each other.
- Edits to a skill from a source that is not on GitHub go unnoticed, and the next install replaces them.
- A skill whose folder upstream holds files the CLI never copies (`metadata.json`, `.git`) or symlinks has a folder hash that never matches its lock, so every Ship asks about it.
