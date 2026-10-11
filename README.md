# fleetfizz

Keeps every Machine on a Tailscale tailnet in line with one config: the vite-plus toolchain (vp version, Node default, global packages at semver ranges) and a managed clone of each tracked git repo, installed from its origin ref. One command, `fleetfizz ship`, runs only on the Machine you start it from and drives the others over `tailscale ssh`.

Terms are defined in [CONTEXT.md](./CONTEXT.md); decisions in [docs/adr](./docs/adr).

## Usage

Install fleetfizz as a vp Global on the Machine you will ship from, and write the config at `~/.config/fleetfizz/fleet.config.jsonc` (or `$XDG_CONFIG_HOME/fleetfizz/`):

```sh
vp install -g fleetfizz
mkdir -p ~/.config/fleetfizz
```

```jsonc
{
  "$schema": "./fleet.schema.json",
  // The Fleet: every Machine a Ship touches, by its tailnet name. The Machine
  // you ship from must be listed.
  "machines": {
    "connors-mac-studio": { "clones": "/Volumes/StudioStack SSD/fleetfizz/clones" },
    "connors-macbook-pro": {},
  },
  "repos": [
    {
      "origin": "connorch/t3code",
      "ref": "main",
      "platforms": ["darwin"],
      "install": "pnpm install && pnpm build",
      "outputs": ["~/Applications/T3 Code.app"],
    },
  ],
  "vp": {
    "version": "1.1.0",
    "node": "24.18.1",
    "globals": { "vercel": "^59.25.4", "wrangler": "^4.136.3" },
  },
}
```

Then:

```sh
fleetfizz ship --dry-run   # gather every Machine and print its plan; change nothing
fleetfizz ship             # apply the plan everywhere, in parallel
```

Every Ship copies this config (and `fleet.schema.json`, for editor validation) to every Machine in the Fleet and installs its own fleetfizz version there, so any Machine can run the next Ship. A new Machine joins by enabling Tailscale SSH and being added to `machines`; a Ship installs vp on it if it has none. If another Machine holds a config that was shipped more recently than this one, the Ship asks before overwriting it; `--overwrite-config` answers yes in advance, and without a terminal the Ship stops instead.

Flags: `--only <machine>` (repeatable), `--rebuild <repo>` or `--rebuild all`, `--bump` and `--enforce` to answer above-range questions in advance, `--overwrite-config`, `--config <path>`.

The Starting Machine needs `tailscale` (with Tailscale SSH to the others) and `gh` logged in; its token is lent to each Machine on stdin for one Ship so private repos clone, and is never written anywhere. A remote Machine needs only Tailscale SSH, `git`, `curl`, and a shell.

## Development

Node 24 and pnpm 12. `pnpm install` once, then:

| Command      | What it does                                    |
| ------------ | ----------------------------------------------- |
| `pnpm check` | typecheck, lint, format check, and tests        |
| `pnpm build` | bundle the CLI to `apps/cli/dist/fleetfizz.mjs` |
| `pnpm fmt`   | format                                          |

Layout: `apps/cli` is the published `fleetfizz` package; `packages/config` (the config schema), `packages/core` (pure planning), and `packages/remote` (tailnet, transport, remote scripts) are private and bundled into it.
