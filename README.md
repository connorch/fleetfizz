![fleetfizz: Your machines, in sync.](https://fleetfizz.com/readme-banner.png)

Keeps every Machine on a Tailscale tailnet in line with one config: the global packages of vp, npm, bun, and pnpm at semver ranges, Homebrew Formulae and Casks, agent skills installed with the skills CLI, Shared Files copied from the Machine you ship from, and a managed clone of each tracked git repo, installed from its origin ref. One command, `fizz ship`, runs only on the Machine you start it from and drives the others over `tailscale ssh`.

Terms are defined in [CONTEXT.md](./CONTEXT.md); decisions in [docs/adr](./docs/adr).

## Usage

Install fleetfizz with any package manager (npm, pnpm, bun, or vp, on Node 24 or newer) on the Machine you will ship from, then run `fizz init`. It checks that this Machine is ready to ship, asks which Machines on your tailnet are in the Fleet and what to keep in line, offers the fleetfizz skill, and writes the config at `~/.config/fleetfizz/config.jsonc` (or `$XDG_CONFIG_HOME/fleetfizz/`):

```sh
npm install -g fleetfizz   # or: pnpm add -g, bun add -g, vp install -g
fizz init
```

A config written by hand looks like this:

```jsonc
{
  "$schema": "./schema.json",
  // The fleetfizz every Machine runs. A fizz of another version installs this
  // one first; fizz self-update changes it.
  "version": "0.15.4",
  // The Fleet: every Machine a Ship touches, by its tailnet name. The Machine
  // you ship from must be listed.
  "machines": ["connors-mac-studio", "connors-macbook-pro"],
  "repos": {
    "cloneRoot": [
      { "machines": ["connors-mac-studio"], "path": "/Volumes/StudioStack SSD/fleetfizz/clones" },
    ],
    "items": {
      "t3code": {
        "origin": "connorch/t3code",
        "ref": "main",
        "platforms": ["darwin"],
        "install": "pnpm install && pnpm build",
        "outputs": ["~/Applications/T3 Code.app"],
      },
    },
  },
  // Global packages, one section per package manager: vp, npm, bun, pnpm.
  // A Ship never installs a package manager or Node; that is yours, here as
  // an npm Global.
  "npm": { "items": { "pnpm": "^12" } },
  "pnpm": {
    "dependsOn": ["npm"],
    "items": {
      "vercel": "^59.25.4",
      "skills": "^1.7.0",
      "wrangler": { "range": "^4.136.3", "machines": ["connors-mac-studio"] },
    },
  },
  // Homebrew packages: "*" installs when missing; "latest" runs brew update,
  // then upgrades on every Ship. A tapped name taps on install.
  "brew": {
    "items": {
      "gh": "*",
      "oven-sh/bun/bun": "latest",
      "tmux": { "range": "*", "platforms": ["linux"] },
    },
  },
  "cask": { "items": { "ghostty": "latest" } },
  // Agent skills, installed with the skills CLI (a Global) for each agent,
  // and kept at their GitHub ref.
  "skills": {
    "agents": ["claude-code", "codex"],
    "items": { "grilling": "mattpocock/skills", "fleetfizz": "connorch/fleetfizz" },
  },
  // Shared Files: copied from the Machine you ship from. A directory is
  // mirrored. "after" runs on each Machine a Ship writes it to.
  "files": {
    "items": {
      "vaut": "~/.config/vaut",
      "mise": { "path": "~/.config/mise/config.toml", "after": "mise install" },
      "karabiner": { "path": "~/.config/karabiner", "exclude": ["automatic_backups"] },
    },
  },
}
```

Then:

```sh
fizz init             # check this Machine and write a first config
fizz status           # where every Item stands on every Machine; change nothing
fizz ship --dry-run   # check every Machine and print its plan; change nothing
fizz ship             # apply the plan everywhere, in parallel
fizz report           # print the full Ledger of the last Ship from this Machine
fizz logs             # print the Ship Log of the latest Ship that started on or reached this Machine
fizz config           # show each Provider's Items and the Machines they target
fizz config add brew tmux --platform linux   # add an Item; also machines, vp, npm, bun, pnpm, cask, skills, repos, files
fizz config remove brew:tmux                 # remove one; a Ship never uninstalls it
fizz self-update      # set the config's version to the newest fleetfizz and install it here
```

`fleetfizz` is an alias of `fizz`.

To let your coding agent edit the config, ship, and debug a Ship, keep the fleetfizz skill on every Machine as a Skill in the config, as above. `fizz init` offers to add it; without the skills CLI, install it here with `npx skills add connorch/fleetfizz -g`.

The Ledger lists each Machine and, under it, what changes there, by address: `pnpm:vercel`, `repos:t3code`. In a terminal it updates as the Ship runs; press `f` to see every item, unchanged ones included. Piped to a file, it prints the full list once at the end.

To debug a Ship, read its Ship Log: every script each Machine ran, every line it printed, every decision, and full errors. Each Ship ends by printing its id (`log: fizz logs <ship-id>`). The log lives on the Machine that started the Ship, and `fizz logs` reads it from any Machine over Tailscale SSH.

Every fizz that reads the config runs the `version` it names: an older or newer one installs it with the package manager that installed it, then runs the same command again. Every Ship copies this config (and `schema.json`, for editor validation) to every Machine in the Fleet and installs that fleetfizz there (`fleetfizz:fleetfizz`), with the package manager that installed fizz on that Machine, or the Starting Machine's when it has none, so any Machine can run the next Ship. A new Machine joins by enabling Tailscale SSH and being added to `machines`. Add only Machines you trust as much as the one you ship from: any Machine in the Fleet can start the next Ship, and what it ships runs on every Machine. If another Machine's config was edited there, was never written by a Ship, or was shipped there more recently than this one last reached it, the Ship asks first: use that config here and ship it, overwrite it with this one, or stop, and can show the diff before you pick. `--overwrite-config` answers overwrite in advance, and without a terminal the Ship stops instead.

Each Install Command runs in a login shell inside its Managed Clone, with `FLEETFIZZ_MACHINE`, `FLEETFIZZ_PLATFORM`, and `FLEETFIZZ_MACHINES` (every Machine in the Fleet, comma-separated) set.

Every section has the same shape: `platforms` and `machines` (Targeting), `dependsOn`, its own settings, and `items`, keyed by name. Each Item can take Targeting too, and they combine with AND, so a Global applies where both it and its section do. An Item can also be a list of Variants, whole entries each with its own Targeting, and a Machine gets the first that targets it: `"vercel": [{ "platforms": ["linux"], "range": "^60" }, "^59.25.4"]`.

Sections run in a built-in order: brew, cask, files, vp, npm, bun, pnpm, skills, repos, then fleetfizz itself. So an `after` can use a Formula, a package manager finds the Node a Formula or Shared File set up, and an Install Command can use any of them. `dependsOn` changes the order, and only `dependsOn` holds a section back when another fails on a Machine ("depends on npm"); the order sections are written in never matters.

Scripts on each Machine run in a login shell, with the usual bin directories of vp, pnpm, bun, mise, volta, fnm, and nvm added to PATH. When a Machine needs more, `"shell": { "init": "source ~/.zshrc" }` runs first (or Variants of `{ "command" }` per Machine or Platform).

`brew` (Formulae) and `cask` (Casks) need Homebrew on every Machine they target; a Ship never installs it, and `brew:brew` fails on a Machine without it. Casks fail on Linux, so in a Fleet with Linux Machines, give `cask` (and `brew`, if Linux has no Homebrew) `"platforms": ["darwin"]`. Homebrew installs only a package's newest version, so a Range there is only `"*"` or `"latest"`. A `"latest"` package always shows as planned in a dry run; whether there is something newer is known only after `brew update`, and the Ledger then shows the version it reached.

Flags: `--only <machine>` (repeatable), `--rebuild repos:<name>` to reinstall a Tracked Repo (or `skills:<name>` a skill, or `files:<name>` to run a Shared File's `after` again) or `--rebuild all`, `--answer kind=choice` to answer Questions in advance (`range=bump|skip|downgrade`, `config=overwrite|stop`, `file=overwrite|skip`, `skill=overwrite|skip`, or one subject: `range:pnpm:vercel=bump`; repeatable), `--bump`, `--enforce`, and `--overwrite-config` (short for `range=bump`, `range=downgrade`, and `config=overwrite`), `--config <path>`.

The Starting Machine needs `tailscale` (with Tailscale SSH to the others), and `gh` logged in if any Tracked Repo is private; its token is lent to each Machine on stdin for one Ship so private repos clone, and is never written anywhere. A remote Machine needs only Tailscale SSH, `git`, and a shell, plus the package managers its sections use and Node 24 with one to install fizz.

## Development

Node 24 and pnpm 12. `pnpm install` once, then:

| Command             | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `pnpm check`        | typecheck, lint, format check, and tests                     |
| `pnpm e2e`          | build, then ship across a Fleet of containers (Docker)       |
| `pnpm e2e:darwin`   | the same, with a Tart VM's two Mac users joining them (Tart) |
| `pnpm build`        | bundle the CLI to `apps/cli/dist/fleetfizz.mjs`              |
| `pnpm fmt`          | format                                                       |
| `pnpm images`       | render the share image, README banner, and icons             |
| `pnpm video`        | open Remotion Studio for the site's motion graphics          |
| `pnpm video:render` | render them to transparent WebM and HEVC (macOS)             |

Layout: `apps/cli` is the published `fleetfizz` package; `packages/config` (the config schema), `packages/core` (the Provider interface and the pure planning engine), `packages/remote` (tailnet, transport, remote scripts), and `packages/providers` (the built-in Providers: brew, cask, files, the package managers, skills, repos, and fleetfizz) are private and bundled into it. `apps/e2e` ships the built package across a Fleet of containers, with a stand-in for `tailscale` (ADR 0021). For the site, `apps/website` is fleetfizz.com; it and `packages/video` (motion graphics as Remotion compositions) share the name, copy, colors, and glyph in `packages/brand-assets`, which also renders the share image, README banner, and favicons from them.
