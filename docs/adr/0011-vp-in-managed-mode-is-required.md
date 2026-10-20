---
status: superseded by ADR-0020
---

# vp in managed mode is required

vp's shims run in one of two modes per tool. In managed mode, `node`, `npm`, `pnpm`, `yarn`, and `bun` run vp's default version of each. In system-first mode, they run a system install when one exists (Homebrew's Node, say) and fall back to vp's only when there is none. On a system-first Machine, `vp.node` and the package-manager keys set defaults that nothing runs, so the Ledger would say a Machine is in line while its shells run something else.

So managed mode is required, as an implicit Item, `vp:mode`, on every Machine. A Ship reads it with `vp env doctor`, which reports each shim's mode and installs nothing (`vp env current` can download a tool). A Machine with any tool in system-first mode gets a Question:

| kind   | subject   | choices           | default |
| ------ | --------- | ----------------- | ------- |
| `mode` | `vp:mode` | `managed`, `skip` | `skip`  |

`managed` runs `vp env on`, which switches every tool, before any default is set. `skip` leaves the mode as it is and skips that Machine's Node and package-manager defaults ("needs managed mode"), since setting them would change nothing. vp itself, Globals, and fleetfizz still ship. Like a `range` skip (ADR 0006), the Question is asked again on the next Ship.

Skip is the default because switching changes which `node` every shell on that Machine runs, which a Ship must not do without someone saying so. Without a terminal, the Machine keeps working as it did.

A bare Machine's fresh vp is switched without a Question: its mode cannot be read before the install, and nothing on it relies on a system-first shim yet.

## Considered Options

- **Switching without asking (rejected).** It would silently move a Machine off a system Node that something there may depend on.
- **A mode per tool (rejected).** `vp env on` switches every tool, and a Machine managed for one tool and not another is the drift this fixes.
- **Skipping the whole vp section (rejected).** fleetfizz is a Global, so the Machine would fall behind the Fleet and could not run the next Ship.

## Consequences

- Package managers are flat vp keys beside `node`: `"vp": { "pnpm": "^10", "yarn": "^4" }`, each kept with `vp env default <tool>@<version>`. Yarn 2 and newer resolves from `@yarnpkg/cli-dist`.
- A Global cannot be named `node`, `npm`, `pnpm`, `yarn`, `bun`, `mode`, `vp`, `vite-plus`, or `fleetfizz`; the schema points to the vp key instead.
- `--answer mode=managed` switches every system-first Machine in advance.
