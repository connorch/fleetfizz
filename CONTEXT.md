# fleetfizz

fleetfizz keeps every Machine on a Tailscale tailnet in line with one config: the vite-plus toolchain and its Globals, and a Managed Clone of each Tracked Repo, installed from its origin ref.

## Language

### The Fleet

**Fleet**:
Every macOS and linux Machine on the tailnet.
_Avoid_: devices, hosts, cluster

**Machine**:
One member of the Fleet, named by the first label of its MagicDNS name (`connors-mac-studio`).
_Avoid_: device, host, box

**Platform**:
A Machine's OS family: `darwin` or `linux`. Any other OS is not part of the Fleet.
_Avoid_: OS, device type

**Starting Machine**:
The Machine where a Ship is run; the only Machine that runs fleetfizz. It is also a target of its own Ship.
_Avoid_: controller, master, local machine

**Targeting**:
The Platforms and Machines a config entry applies to; its fields combine with AND, and an unset field means every one.
_Avoid_: filter, selector, scope

### Shipping

**Ship**:
One manual run that brings every reachable targeted Machine in line with the config: its vp section and its Tracked Repos.
_Avoid_: deploy, sync, rollout

**Gather**:
The phase of a Ship that reads each Machine's current state without changing anything.
_Avoid_: probe, scan, fetch

**Plan**:
The phase of a Ship that turns the config and gathered state into Steps and Questions for each Machine. Also the result of that phase.
_Avoid_: diff, preview

**Question**:
A choice the Plan cannot make alone, asked on the Starting Machine before anything changes (a Global above its Range).
_Avoid_: conflict, prompt (a prompt is how a Question is asked)

**Apply**:
The phase of a Ship that runs each Machine's Steps.
_Avoid_: execute, deploy

**Step**:
One unit of change on one Machine (fetch a Tracked Repo, run its Install Command, install Globals) whose success is reported on its own.
_Avoid_: task, action, job

**Ledger**:
The append-only output of a Ship: one line per event, with elapsed time, Machine, tag, and message.
_Avoid_: log, report

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
For one Machine and one Tracked Repo: the commit, Managed Clone path, and Install Command of the last successful install.
_Avoid_: lock, cache, receipt

### The vp section

**vp section**:
The part of the config that sets the vite-plus toolchain on each Machine: the vp version, the Node default, and the Globals.
_Avoid_: toolchain config, runtime

**Global**:
A package installed with `vp install -g`.
_Avoid_: tool, binary, global package

**Range**:
A package.json semver spec (`^59.25.4`, `1.2.3`, `*`, `latest`) that a Global, vp, or Node must satisfy.
_Avoid_: version constraint, requirement

### Secrets

**Lent Token**:
The Starting Machine's GitHub token, held in memory on a remote Machine for one Ship so it can fetch private Tracked Repos.
_Avoid_: credential forwarding, shared token

## Relationships

- A **Ship** runs **Gather** on every reachable targeted **Machine**, then one **Plan**, then asks every **Question**, then **Apply** on every **Machine**
- No **Machine** changes until every **Question** from every **Machine** is answered
- A **Machine** has one **Clone Root**, which holds one **Managed Clone** per targeted **Tracked Repo**
- A **Managed Clone** has at most one **Install Record**; the **Install Command** runs again only when the commit, the path, or the **Install Command** differs from it
- The **Starting Machine** lends its **Lent Token** to each other **Machine** for the length of one **Ship**; **Install Commands** never see it
- An offline **Machine** is skipped, never failed, and stays behind until the next **Ship**

## Example dialogue

> **Dev:** "I ran pnpm install:desktop:local in my own t3code checkout on the MacBook Pro. Does the next **Ship** put origin back?"
> **Connor:** "Not by itself. The **Managed Clone** is still at the same commit, so its **Install Record** matches and the **Install Command** is skipped. Ship with `--rebuild connorch-t3code`."

> **Dev:** "Someone ran `vp update -g` and vercel is now 60.1.0, but the **Range** is `^59.25.4`."
> **Connor:** "That's a **Question**. The **Ship** asks it on the **Starting Machine** before any **Machine** changes: bump the **Range**, skip it on that **Machine**, or downgrade."

## Flagged ambiguities

- "Ship" used to mean installing one repo's skills; it now covers every **Tracked Repo** and the **vp section**.
- "Managed Clone" used to mean only the skills repo's clone on a remote Machine; it now means any **Tracked Repo**'s clone on any **Machine**, the **Starting Machine** included.
- "working copy" is the developer's own checkout, where the config is read from. It is never a **Managed Clone**, and a **Ship** never installs from it.
