The vite-plus toolchain.

| Field | Description |
| --- | --- |
| `dependsOn` | Providers whose Items must succeed on a Machine before this one changes there. |
| `version` | The vp version. Pin it exactly. |
| `node` | The default Node version. Pin it exactly. |
| `npm` | The default npm version. |
| `pnpm` | The default pnpm version. |
| `yarn` | The default Yarn version. |
| `bun` | The default Bun version. |
| `items` | Globals, keyed by package. Each is a Range, `{ range, platforms?, machines? }` to target it, or a list of Variants, of which a Machine gets the first that targets it. |
