# fleetfizz

Keeps every Machine on a Tailscale tailnet in line with one config: the vite-plus toolchain (vp version, Node default, global packages at semver ranges) and a managed clone of each tracked git repo, installed from its origin ref. One command, `fleetfizz ship`, runs only on the Machine you start it from and drives the others over `tailscale ssh`.

Terms are defined in [CONTEXT.md](./CONTEXT.md); decisions in [docs/adr](./docs/adr).

## Development

Node 24 and pnpm 12. `pnpm install` once, then:

| Command      | What it does                                    |
| ------------ | ----------------------------------------------- |
| `pnpm check` | typecheck, lint, format check, and tests        |
| `pnpm build` | bundle the CLI to `apps/cli/dist/fleetfizz.mjs` |
| `pnpm fmt`   | format                                          |

Layout: `apps/cli` is the published `fleetfizz` package; `packages/config` (the config schema), `packages/core` (pure planning), and `packages/remote` (tailnet, transport, remote scripts) are private and bundled into it.
