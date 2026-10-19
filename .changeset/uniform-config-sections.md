---
"fleetfizz": minor
---

Every config section now has the same shape: `platforms`, `machines`, `dependsOn`, its own settings, and `items`, keyed by name (ADR 0014).

- Breaking: `machines` is a list of names: `"machines": ["connors-mac-studio", "connors-macbook-pro"]`.
- Breaking: `repos` is a section, with each Tracked Repo under `repos.items`, keyed by its name. The key names the Managed Clone and the Item (`repos:t3code`), and `name` is gone, so a repo whose name changes is cloned and installed again; its old clone is left in place.
- Breaking: `machines.<name>.clones` moves to `repos.cloneRoot`: a path, or a list of `{ path, platforms?, machines? }` where a Machine gets the first that targets it.
- Breaking: `vp.globals` is now `vp.items`.
- Any Item can be a list of Variants, whole entries each with its own Targeting, and a Machine gets the first that targets it: `"vercel": [{ "platforms": ["linux"], "range": "^60" }, "^59.25.4"]`.
- A key repeated in the config is an error instead of silently replacing the first.
- Upgrade every Machine, then ship first from the Machine whose config is newest: the first Ship cannot read the old-shape copies elsewhere, so it overwrites them without the usual newer-config Question.
