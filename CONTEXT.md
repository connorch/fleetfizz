# fleetfizz

fleetfizz keeps every Machine on a Tailscale tailnet in line with one config: the Globals of each package manager, Homebrew packages, agent Skills, Shared Files, and a Managed Clone of each Tracked Repo, installed from its origin ref.

## Language

### The Fleet

**Fleet**:
The Machines listed in the Config. A tailnet member that is not listed is not part of the Fleet.
_Avoid_: devices, hosts, cluster, whitelist

**Machine**:
One member of the Fleet, named by the first label of its MagicDNS name (`connors-mac-studio`).
_Avoid_: device, host, box

**Platform**:
A Machine's OS family: `darwin` or `linux`. Any other OS is not part of the Fleet.
_Avoid_: OS, device type

**Starting Machine**:
The Machine where a Ship is run. Any Machine in the Fleet can be one, and it is also a target of its own Ship.
_Avoid_: controller, master, local machine

**Config**:
The one `config.jsonc` that describes the Fleet, kept at the same path on every Machine. The Starting Machine's copy is the one a Ship reads, and the Ship copies it to every other Machine.
_Avoid_: manifest, fleet file, settings

**Stale Config**:
A Config that a Ship of the Starting Machine's Config must not overwrite without asking: one that Machine received more recently than this one last reached it (a Ship from elsewhere missed this Machine), one edited there, or one no Ship wrote. The Config's Install Record on each Machine says which. The Ship asks a Question before going on: use that config on the Starting Machine and start over from it, overwrite it, or stop.
_Avoid_: outdated config, conflict

**Version**:
The fleetfizz version the Config names, exact. Every fizz reads it before anything else, and a fizz of another version, older or newer, installs this one with the package manager that installed it and runs the command again with it. The `fleetfizz:fleetfizz` Item keeps it on every Machine.
_Avoid_: pin, self-update (that is the command that changes it)

**Targeting**:
The Platforms and Machines a config entry applies to; its fields combine with AND, and an unset field means every one.
_Avoid_: filter, selector, scope

### Shipping

**Ship**:
One manual run that brings every reachable targeted Machine in line with the config: every Item of every Provider.
_Avoid_: deploy, sync, rollout

**Check**:
The phase of a Ship that reads each Machine's current state without changing anything. A checked Machine is waiting until every Machine is checked and every Question is answered.
_Avoid_: gather, probe, scan, fetch

**Plan**:
The phase of a Ship that turns the config and checked state into Steps and Questions for each Machine. Also the result of that phase.
_Avoid_: diff, preview

**Question**:
A choice the Plan cannot make alone, asked on the Starting Machine before anything changes (a Global above its Range, a Stale Config, a Shared File with Drift, a Skill folder an install would replace). `--answer kind=choice` answers every Question of a kind in advance, and `--answer kind:subject=choice` one of them.
_Avoid_: conflict, prompt (a prompt is how a Question is asked)

**Apply**:
The phase of a Ship that runs each Machine's Steps.
_Avoid_: execute, deploy

**Step**:
One unit of work on one Machine (fetch a Tracked Repo, run its Install Command, install Globals) whose success is reported on its own; most Steps change an Item, and some are upkeep that keeps one as it is.
_Avoid_: task, action, job

**Ledger**:
The output of a Ship: one line per Machine with a summary of its items and, under it, one line per Item that changes, written `provider:item` (`pnpm:vercel`, `repos:t3code`), with its status, result, and time. In a terminal it is redrawn live as Steps run; the full Ledger lists unchanged items too, and `fizz report` prints the last one.
_Avoid_: log

**Status**:
Where every Item stands on every reachable Machine now, from a Check and a Plan that change nothing: in line, to change, a Question, or failing. `fizz status` shows it; unlike a dry run, it is grouped by Item, asks nothing, and writes no Ship Log.
_Avoid_: state (a Machine's checked state is what the Check reads), health

**Ship Log**:
Everything one Ship did, written on the Starting Machine as it runs and named by the Ship id (when it started and where): every Machine's scripts and every line they printed, the Ship's decisions, and full errors. `fizz logs` prints one from any Machine.
_Avoid_: report (that is the saved Ledger), trace

### Providers

**Provider**:
One kind of thing a Ship can keep in line on a Machine (a package manager's Globals, Tracked Repos, Formulae, Casks, Skills, Shared Files), with its own section of the config. fleetfizz itself is a Provider without a section: the Version sets it.
_Avoid_: kind, adapter, plugin, manager

**Item**:
One entry a Provider keeps in line on one Machine: a Global, a Tracked Repo, a Formula, a Cask, a Skill, a Shared File, or fleetfizz itself. Written `provider:item` (`pnpm:vercel`, `repos:t3code`, `fleetfizz:fleetfizz`).
_Avoid_: resource, dependency, package

**Variant**:
One of an Item's complete alternative definitions, each with its own Targeting. A Machine gets the first Variant that targets it; an Item with no Variant for a Machine is not targeted there.
_Avoid_: override, profile, patch

### Tracked Repos

**Tracked Repo**:
A git repo the config lists, with an origin, a ref, an Install Command, and Targeting.
_Avoid_: project, package

**Managed Clone**:
The checkout of a Tracked Repo that fleetfizz owns on one Machine, reset to the origin ref on every Ship.
_Avoid_: mirror, cache, working copy

**Clone Root**:
The directory on one Machine that holds its Managed Clones.
_Avoid_: workspace

**Pin**:
A Tracked Repo ref that is a full commit SHA instead of a branch.
_Avoid_: lock, tag

**Install Command**:
The shell command that installs a Tracked Repo from its Managed Clone.
_Avoid_: build script, hook

**Install Record**:
For one Machine and one Item of a Provider that cannot report what it installed: for a Tracked Repo, the commit, Managed Clone path, Install Command, and Output fingerprints of the last successful install; for a Shared File, the fingerprint and time of the last copy a Ship wrote there; for the Config, the Ship that wrote it there, its sha256, and when a Ship of it last reached each Machine. For a Skill, the agents a Ship installed it for; the rest (source, ref, folder hash) is the skills CLI's own lock entry, which fleetfizz reads but never writes.
_Avoid_: lock, cache, receipt

**Output**:
A path outside the Managed Clone that a Tracked Repo's Install Command produces, declared in the config so a Ship can tell whether it still matches the last install.
_Avoid_: artifact, build product

**Drift**:
An Item whose current state no longer matches its Install Record, usually because someone changed it by hand on that Machine. A Tracked Repo's Drift is an Output that no longer matches, and it makes the next Ship run the Install Command again; a Shared File's Drift is an edit made there, and the Ship asks a Question before overwriting it.
_Avoid_: stale, dirty

### Package managers

**Package manager**:
vp, npm, bun, or pnpm, each with its own section of Globals. A Ship never installs one or keeps its version, or Node's: that is the user's, through a Global of another package manager, a Formula, or a Shared File.
_Avoid_: toolchain, runtime, version manager

**Global**:
A package a package manager installs with its global install (`pnpm add -g`), an Item of that package manager's Provider.
_Avoid_: tool, binary, global package

**Range**:
A package.json semver spec (`^59.25.4`, `1.2.3`, `*`, `latest`) that a Global must satisfy. A Formula or Cask takes only `*` or `latest`: Homebrew installs only the newest version.
_Avoid_: version constraint, requirement

### Homebrew

**Formula**:
A Homebrew package, an Item of the `brew` Provider. Homebrew itself is the `brew:brew` Item, which a Ship checks but never installs.
_Avoid_: brew package

**Cask**:
A Homebrew macOS app, an Item of the `cask` Provider. A Cask and a Formula can share a name (`ollama`).
_Avoid_: app, brew app

### Skills

**Skill**:
An agent skill (a folder with a `SKILL.md`), installed on a Machine with the skills CLI from its source and kept at its ref, for each of its Agents. An Item of the `skills` Provider, keyed by the skill's name.
_Avoid_: plugin, prompt, command

**Agent**:
An agent harness a Skill is installed for, named by the skills CLI's id (`claude-code`, `codex`). The skills CLI knows where each one reads its skills.
_Avoid_: harness, tool, client

### Shared Files

**Shared File**:
A file or directory, from any path, that a Ship copies from the Starting Machine to every targeted Machine, with its mode bits. A directory is mirrored: what the Starting Machine no longer has is deleted on the target too, except the paths the Item excludes. An Item of the `files` Provider.
_Avoid_: dotfile, synced file, mirror

### Secrets

**Lent Token**:
The Starting Machine's GitHub token, held in memory on a remote Machine for one Ship so it can fetch private Tracked Repos.
_Avoid_: credential forwarding, shared token

## Relationships

- A **Ship** runs a **Check** on every reachable **Machine** in the **Fleet**, then one **Plan**, then asks every **Question**, then **Apply** on every **Machine**
- Every **Ship** copies the **Starting Machine**'s **Config** to every reachable **Machine**, and installs fleetfizz at the **Version** there, so any **Machine** can be the next **Starting Machine**
- A **Ship**'s logic is one fleetfizz version's: the **Starting Machine** runs the **Version** before it checks anything
- No **Machine** changes until every **Question** from every **Machine** is answered
- A **Machine** has one **Clone Root**, which holds one **Managed Clone** per targeted **Tracked Repo**
- A **Managed Clone** has at most one **Install Record**; the **Install Command** runs again only when the commit, the path, the **Install Command**, or an **Output** differs from it (**Drift**)
- The **Starting Machine** lends its **Lent Token** to each other **Machine** for the length of one **Ship**; **Install Commands** never see it
- An offline **Machine** is skipped, never failed, and stays behind until the next **Ship**
- A **Provider** can depend on other **Providers**, only through `dependsOn`. When an **Item** of a dependency fails on a **Machine**, its dependents are skipped there; a dependency the config does not target at that **Machine** does not hold them back
- Removing an **Item** from the **Config** never uninstalls it
- A **Ship** never overwrites a **Shared File** without a **Question** when the target has **Drift**, or when the target got a newer copy from another **Ship** than the **Starting Machine** has
- A **Shared File**'s contents leave a remote **Machine** only when a **Question**'s answer pulls that **Machine**'s copy to the **Starting Machine** (when the **Starting Machine** has none, or instead of overwriting it), or when the person answering views the diff from that copy first

## Example dialogue

> **Dev:** "I ran pnpm install:desktop:local in my own t3code checkout on the MacBook Pro. Does the next **Ship** put origin back?"
> **Connor:** "Only if the app is one of t3code's **Outputs**. Then its fingerprint no longer matches the **Install Record**, that is **Drift**, and the **Ship** reinstalls. Without **Outputs**, the commit is unchanged, so ship with `--rebuild repos:t3code`."

> **Dev:** "Someone ran `pnpm update -g` and vercel is now 60.1.0, but the **Range** is `^59.25.4`."
> **Connor:** "That's a **Question**. The **Ship** asks it on the **Starting Machine** before any **Machine** changes: bump the **Range**, skip it on that **Machine**, or downgrade."

## Flagged ambiguities

- "fleetfizz" is the product (and its npm package); `fizz` is its command. "fleetfizz ship" is wrong: it is `fizz ship`.
- "vp section" used to mean the vite-plus toolchain: vp's version, managed mode, Node, and package-manager defaults. It is now one of four package-manager sections, and holds only Globals.

- "Ship" used to mean installing one repo's skills; it now covers every **Item** of every **Provider**.
- "Managed Clone" used to mean only the skills repo's clone on a remote Machine; it now means any **Tracked Repo**'s clone on any **Machine**, the **Starting Machine** included.
- "File" used to mean a file written into a Managed Clone. The **Install Command** writes those now, and a **Shared File** is any path a Ship copies between Machines.
- "working copy" is the developer's own checkout, where the config is read from. It is never a **Managed Clone**, and a **Ship** never installs from it.
