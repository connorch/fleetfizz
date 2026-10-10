# fleetfizz

Keeps every Machine on a Tailscale tailnet in line with one config: the vite-plus toolchain (vp version, Node default, global packages at semver ranges) and a managed clone of each tracked git repo, installed from its origin ref. One command, `fleetfizz ship`, runs only on the Machine you start it from and drives the others over `tailscale ssh`.

Terms are defined in [CONTEXT.md](./CONTEXT.md); decisions in [docs/adr](./docs/adr).

## Usage

Write a `fleet.config.jsonc` in a repo you keep on every Machine (`$schema` points at the published `fleet.schema.json` for editor validation):

```jsonc
{
  "$schema": "./node_modules/fleetfizz/fleet.schema.json",
  "machines": {
    "connors-mac-studio": { "clones": "/Volumes/StudioStack SSD/fleetfizz/clones" },
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

Then, from that directory:

```sh
npx fleetfizz ship --dry-run   # gather every Machine and print its plan; change nothing
npx fleetfizz ship             # apply the plan everywhere, in parallel
```

Flags: `--only <machine>` (repeatable), `--rebuild <repo>` or `--rebuild all`, `--bump` and `--enforce` to answer above-range questions in advance, `--config <path>`.

The Starting Machine needs `tailscale` (with Tailscale SSH to the others) and `gh` logged in; its token is lent to each Machine on stdin for one Ship so private repos clone, and is never written anywhere. Each Machine needs `vp` on its login-shell PATH.

## Development

Node 24 and pnpm 12. `pnpm install` once, then:

| Command      | What it does                                    |
| ------------ | ----------------------------------------------- |
| `pnpm check` | typecheck, lint, format check, and tests        |
| `pnpm build` | bundle the CLI to `apps/cli/dist/fleetfizz.mjs` |
| `pnpm fmt`   | format                                          |

Layout: `apps/cli` is the published `fleetfizz` package; `packages/config` (the config schema), `packages/core` (pure planning), and `packages/remote` (tailnet, transport, remote scripts) are private and bundled into it.
