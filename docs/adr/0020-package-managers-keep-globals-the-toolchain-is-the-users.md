# Package managers keep Globals; the toolchain is the user's

Every Machine needed vite-plus. The vp Provider ran on every Machine, bootstrapped vp where it was missing, required managed mode (ADR 0011), and kept vp's own version, the default Node, and each package manager's default. A user with npm, pnpm, bun, nvm, mise, or Homebrew's Node had to adopt vp first. fleetfizz now has no special relation with any package manager:

```jsonc
"files": {
  "items": {
    "vp-config": "~/.config/vite-plus/config.json",
    "mise": { "path": "~/.config/mise/config.toml", "after": "mise install" },
  },
},
"npm": { "items": { "pnpm": "^12" } },
"pnpm": { "dependsOn": ["npm"], "items": { "vercel": "^59.25.4" } },
```

- **`vp`, `npm`, `bun`, and `pnpm` are equal Providers, one section each, with one job: their Globals.** Each keeps its Globals inside their Ranges (ADR 0006) with its own commands, and that is all that differs between them:

  | Section | Lists with                       | Installs with    |
  | ------- | -------------------------------- | ---------------- |
  | `vp`    | `vp list --global --json`        | `vp install -g`  |
  | `npm`   | `npm ls -g --depth=0 --json`     | `npm install -g` |
  | `bun`   | `bun pm ls -g` (a tree, no JSON) | `bun add -g`     |
  | `pnpm`  | `pnpm ls -g --depth=0 --json`    | `pnpm add -g`    |

  A Provider exists only when its section is in the config. A Global of a package manager that is not on the Machine fails ("pnpm is not installed"), unless another section installs that package manager there in this Ship: then it waits for the next Ship, as skills wait for their CLI (ADR 0018). Yarn is not one of them: Yarn 2 and newer has no global installs.

- **No Provider keeps a package manager's version, or Node's.** That is the user's, with what the config already has: a package manager as a Global of another (`npm.items.pnpm`), a Formula (`node@24`, `vite-plus`), or a Shared File for the tool that keeps the version (vp's `~/.config/vite-plus/config.json`, mise's `config.toml`). For vp, only `config.json` is shared: the `env` files beside it are written by vp's installer. A Ship never installs vp.
- **No rule for a Node change.** vp pins each Global to the Node it was installed with. npm under nvm, fnm, or mise has a global prefix per Node, so after a switch the Check sees the Globals as missing and installs them. pnpm, bun, and npm under Homebrew's Node keep theirs. "Read what the package manager reports, install what is missing" covers each.
- **A Shared File can run a command after a Ship writes it.** `after` runs on the target in a login shell in the file's directory (a directory Item's own), each time a Ship writes the Item there, and before its record, so a failure leaves the old record, and the next Ship sees the copy there without its record and runs `after` again. `--rebuild files:<name>` runs it on a Machine whose copy is already in line. This is how a Node manager installs what its synced config names (`mise install`, `nvm install`).
- **The built-in order only breaks ties**: brew, cask, files, vp, npm, bun, pnpm, skills, repos, then fleetfizz itself (ADR 0019). Homebrew first, so an `after` can use a Formula; then the package managers, so they find the Node a Formula or a Shared File set up, npm before the ones it installs; then skills and repos, so an Install Command can use any of them. `dependsOn` overrides it in both directions, and only `dependsOn` holds a Provider back when another fails: no Provider depends on another implicitly, so repos no longer wait on vp. The order sections are written in the config never matters.
- **Every script puts the known bin directories on PATH.** A login shell over ssh reads no rc file: Ubuntu's `.bashrc` returns early when it is not interactive, and zsh reads `.zshrc` only when it is. So the prelude sources vp's env file when there is one, as an interactive shell would, sets `PNPM_HOME` to pnpm's default when it is unset (pnpm installs Globals only with it), and appends vp's, pnpm's, bun's, mise's shims, volta's, and fnm's default bin directories, so what the login shell already has wins. nvm's default is an alias only `nvm.sh` resolves, so `nvm.sh` is sourced when nothing before it gave a `node`. A Check sets `MISE_NOT_FOUND_AUTO_INSTALL=false`, so a mise shim for a tool that is not installed fails rather than installing it during a read-only Check.
- **`shell.init` runs first, when a Machine needs more.** One command, or Variants of `{ command }` per Machine or Platform, such as `source ~/.zshrc`. It runs with stdin closed, so it cannot read the secrets an Apply sends there.

## Considered Options

- **One toolchain abstraction over vp, mise, volta, fnm, and nvm (rejected).** It would keep only what they share: nvm is a shell function, volta pins per tool, mise keeps its versions in its own files, and only some keep Globals per Node.
- **Sourcing `.bashrc` or `.zshrc` before every script (rejected).** Ubuntu's returns before anything useful, `.zshrc` is often slow and expects a terminal, and an rc file that reads stdin would take the Lent Token.
- **The config's key order as the tie-break (rejected).** Most people treat JSON key order as meaningless; `fizz config add` appends a new section at the end, and a key-sorting formatter would reorder a Ship.
- **No default order (rejected).** Every Machine that already has Homebrew and mise would work, and a new Machine would break the first time it was needed, unless every user wrote `dependsOn` for the usual layering.
- **Keeping vp's reinstall of Globals after a Node change (rejected).** vp pins each Global's Node, so nothing breaks; moving them is a choice about the user's toolchain.
- **Node in a Tracked Repo's Install Record (deferred).** A cargo repo would rebuild on every Node change. An opt-in list of commands whose output joins the record (`"inputs": ["node --version"]`) would cover it if it is needed; `--rebuild` does today.
- **A check that a Global is shadowed by another package manager's copy on PATH (deferred).** It is the same for every Global, and needs each package manager's bin directory.

## Consequences

- Supersedes ADR 0011: there is no `vp:mode` Item and no `mode` Question.
- Amends ADR 0010: the built-in order is a tie-break only, and no Provider has an implicit dependency. Amends ADR 0014: the vp section has no settings that create Items. Amends ADR 0018: the skills CLI is a Global of any package manager, and skills have no implicit dependency.
- A config with `vp.version`, `vp.node`, or a package-manager key fails to load with an error that names the new shape; nothing migrates it.
- `fizz config add vp|npm|bun|pnpm <package>` adds a Global, and `fizz init` offers the Globals of every package manager on the Machine.
- npm with a system Node on linux needs sudo for `-g`, so its Globals fail with npm's own error until its prefix is the user's.
- A native addon built for an old Node can break after a major Node change under pnpm or Homebrew's npm, unseen by the Check.
- bun installed as a pnpm Global runs before pnpm by default; `"bun": { "dependsOn": ["pnpm"] }` fixes it.
