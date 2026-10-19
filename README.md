# fleetfizz

Keeps every Machine on a Tailscale tailnet in line with one config: the vite-plus toolchain (vp version, Node and package-manager defaults, global packages at semver ranges), Homebrew Formulae and Casks, and a managed clone of each tracked git repo, installed from its origin ref. One command, `fizz ship`, runs only on the Machine you start it from and drives the others over `tailscale ssh`.

Terms are defined in [CONTEXT.md](./CONTEXT.md); decisions in [docs/adr](./docs/adr).

## Usage

Install fleetfizz as a vp Global on the Machine you will ship from, and write the config at `~/.config/fleetfizz/config.jsonc` (or `$XDG_CONFIG_HOME/fleetfizz/`):

```sh
vp install -g fleetfizz
mkdir -p ~/.config/fleetfizz
```

```jsonc
{
  "$schema": "./schema.json",
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
  "vp": {
    "version": "1.1.0",
    "node": "24.18.1",
    "pnpm": "^10",
    "items": {
      "vercel": "^59.25.4",
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
}
```

Then:

```sh
fizz ship --dry-run   # check every Machine and print its plan; change nothing
fizz ship             # apply the plan everywhere, in parallel
fizz report           # print the full Ledger of the last Ship from this Machine
fizz logs             # print the Ship Log of the latest Ship that started on or reached this Machine
```

The Ledger lists each Machine and, under it, what changes there, by address: `vp:node`, `repos:t3code`. In a terminal it updates as the Ship runs; press `f` to see every item, unchanged ones included. Piped to a file, it prints the full list once at the end.

To debug a Ship, read its Ship Log: every script each Machine ran, every line it printed, every decision, and full errors. Each Ship ends by printing its id (`log: fizz logs <ship-id>`). The log lives on the Machine that started the Ship, and `fizz logs` reads it from any Machine over Tailscale SSH.

Every Ship copies this config (and `schema.json`, for editor validation) to every Machine in the Fleet and installs its own fleetfizz version there, so any Machine can run the next Ship. A new Machine joins by enabling Tailscale SSH and being added to `machines`; a Ship installs vp on it if it has none. If another Machine holds a config that was shipped more recently than this one, the Ship asks first: use that config here and ship it, overwrite it with this one, or stop. `--overwrite-config` answers overwrite in advance, and without a terminal the Ship stops instead.

Each Install Command runs in a login shell inside its Managed Clone, with `FLEETFIZZ_MACHINE`, `FLEETFIZZ_PLATFORM`, and `FLEETFIZZ_MACHINES` (every Machine in the Fleet, comma-separated) set.

Every section has the same shape: `platforms` and `machines` (Targeting), `dependsOn`, its own settings, and `items`, keyed by name. Each Item can take Targeting too, and they combine with AND, so a Global applies where both it and its section do. An Item can also be a list of Variants, whole entries each with its own Targeting, and a Machine gets the first that targets it: `"vercel": [{ "platforms": ["linux"], "range": "^60" }, "^59.25.4"]`.

Repos run last, after vp and the Homebrew packages, so an Install Command can use a Formula installed in the same Ship; when vp, Node, or a Global fails on a Machine, that Machine's repo changes are skipped ("depends on vp").

`brew` (Formulae) and `cask` (Casks, macOS only) need Homebrew on the Machine; a Ship never installs it, and `brew:brew` fails on a Machine without it. Homebrew installs only a package's newest version, so a Range there is only `"*"` or `"latest"`. A `"latest"` package always shows as planned in a dry run; whether there is something newer is known only after `brew update`, and the Ledger then shows the version it reached.

Flags: `--only <machine>` (repeatable), `--rebuild repos:<name>` to reinstall a Tracked Repo or `--rebuild all`, `--answer kind=choice` to answer Questions in advance (`range=bump|skip|downgrade`, `config=overwrite|stop`, `mode=managed|skip`, or one subject: `range:vp:vercel=bump`; repeatable), `--bump`, `--enforce`, and `--overwrite-config` (short for `range=bump`, `range=downgrade`, and `config=overwrite`), `--config <path>`.

The Starting Machine needs `tailscale` (with Tailscale SSH to the others) and `gh` logged in; its token is lent to each Machine on stdin for one Ship so private repos clone, and is never written anywhere. A remote Machine needs only Tailscale SSH, `git`, `curl`, and a shell.

## Development

Node 24 and pnpm 12. `pnpm install` once, then:

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `pnpm check`        | typecheck, lint, format check, and tests            |
| `pnpm build`        | bundle the CLI to `apps/cli/dist/fleetfizz.mjs`     |
| `pnpm fmt`          | format                                              |
| `pnpm og`           | render the site's share image and icons             |
| `pnpm video`        | open Remotion Studio for the site's motion graphics |
| `pnpm video:render` | render them to transparent WebM and HEVC (macOS)    |

Layout: `apps/cli` is the published `fleetfizz` package; `packages/config` (the config schema), `packages/core` (the Provider interface and the pure planning engine), `packages/remote` (tailnet, transport, remote scripts), and `packages/providers` (the built-in Providers: vp, repos, brew, and cask) are private and bundled into it. For the site, `apps/website` is fleetfizz.com; `packages/brand-assets` holds the name, copy, colors, and glyph that it, `packages/og-image` (the share image and favicons), and `packages/video` (motion graphics as Remotion compositions) share.
