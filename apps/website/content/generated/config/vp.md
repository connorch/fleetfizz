The vite-plus toolchain.

| Field | Description |
| --- | --- |
| `dependsOn` | Providers whose Items must succeed on a Machine before vp changes there. |
| `version` | The vp version. Pin it exactly. |
| `node` | The default Node version. Pin it exactly. |
| `globals` | Global packages, each with a Range, or `{ range, platforms?, machines? }` to target one. |
