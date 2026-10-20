`vp`, `npm`, `bun`, `pnpm`: Globals installed with that package manager's global install. Each needs its package manager on the Machine; a Ship never installs it.

| Field | Description |
| --- | --- |
| `dependsOn` | Providers whose Items must succeed on a Machine before this one changes there. |
| `items` | Globals the section's package manager installs, keyed by package. Each is a Range, `{ range, platforms?, machines? }` to target it, or a list of Variants, of which a Machine gets the first that targets it. |
