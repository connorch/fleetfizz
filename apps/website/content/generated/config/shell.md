How a Ship's scripts start on each Machine.

| Field | Description |
| --- | --- |
| `init` | Shell run before every script a Ship runs on a Machine (`source ~/.zshrc`): a command, or a list of `{ command, platforms?, machines? }` where a Machine gets the first that targets it. By default no rc file is read; the known bin directories of vp, pnpm, bun, mise, volta, nvm, and fnm are on PATH. |
