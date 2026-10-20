// Helpers for generating scripts that run under zsh (macOS) and bash (linux).

// A single-quoted literal; the only thing a login shell cannot reinterpret.
export const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

// A path literal that still expands a leading "~" on the remote Machine.
export const quotePath = (path: string): string => {
  if (path === "~") return '"$HOME"';
  if (path.startsWith("~/")) return `"$HOME"${quote(path.slice(1))}`;
  return quote(path);
};

// Shell functions every generated script starts with.
// Puts the package managers and Node managers a Machine may use on PATH. A
// login shell over ssh reads no rc file (Ubuntu's .bashrc returns early when
// it is not interactive, and zsh reads .zshrc only when it is), so their
// usual PATH lines never run, and every script adds what they would have
// (ADR 0020). vp's env file is sourced as an interactive shell would (dash
// exits on `.` of a missing file, hence the check). Everything else is
// appended, so what the login shell already has wins.
const toolEnv = [
  `ff_env="\${XDG_CONFIG_HOME:-$HOME/.config}/vite-plus/env"`,
  `{ [ ! -f "$ff_env" ] || . "$ff_env"; }`,
  // pnpm installs Globals only with PNPM_HOME set, which `pnpm setup`
  // writes to an rc file; this is its default.
  `if [ -z "\${PNPM_HOME:-}" ]; then if [ "$(uname)" = Darwin ]; then PNPM_HOME="$HOME/Library/pnpm"; else PNPM_HOME="\${XDG_DATA_HOME:-$HOME/.local/share}/pnpm"; fi; export PNPM_HOME; fi`,
  // vp (and its VP_HOME or legacy layout), pnpm, bun, mise's shims, volta,
  // and fnm's default (its data directory on linux, then on macOS).
  `export PATH="$PATH:\${VP_HOME:-$HOME/.vite-plus}/bin:\${XDG_DATA_HOME:-$HOME/.local/share}/vite-plus/bin:$PNPM_HOME:\${BUN_INSTALL:-$HOME/.bun}/bin:\${XDG_DATA_HOME:-$HOME/.local/share}/mise/shims:\${VOLTA_HOME:-$HOME/.volta}/bin:\${FNM_DIR:-\${XDG_DATA_HOME:-$HOME/.local/share}/fnm}/aliases/default/bin:$HOME/Library/Application Support/fnm/aliases/default/bin"`,
  // nvm's default is an alias (`24`, `lts/*`) that only nvm.sh resolves,
  // so it is sourced, and only when nothing above gave a node.
  `if ! command -v node >/dev/null 2>&1 && [ -s "\${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then . "\${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null 2>&1; fi`,
].join("\n");

// Puts Homebrew on PATH for the same reason: over ssh, linux login shells
// skip the .bashrc line that does it. In the prelude, so repos' Install
// Commands find what brew installed. Appended, so a brew already on PATH wins.
const brewEnv = `export PATH="$PATH:/opt/homebrew/bin:/home/linuxbrew/.linuxbrew/bin"`;

export const prelude = [
  toolEnv,
  brewEnv,
  // JSON-escapes $1 for embedding inside a double-quoted JSON string.
  `ff_json() { printf '%s' "$1" | sed -e 's/\\\\/\\\\\\\\/g' -e 's/"/\\\\"/g' | tr -d '\\n'; }`,
  `ff_state() { printf 'ff-state %s\\n' "$1"; }`,
  // The sha256 of stdin, in hex (linux may have only sha256sum).
  `ff_sha() { if command -v shasum >/dev/null 2>&1; then shasum -a 256; else sha256sum; fi | cut -d" " -f1; }`,
  // ff_at provider item version: the version an Item is at now (core's AtFact).
  `ff_at() { ff_state "{\\"provider\\":\\"$(ff_json "$1")\\",\\"fact\\":\\"at\\",\\"item\\":\\"$(ff_json "$2")\\",\\"at\\":\\"$(ff_json "$3")\\"}"; }`,
].join("\n");

// Fingerprints one path: a symlink by its target, a file by its sha256, a
// directory by the sha256 of its sorted file list and file hashes (never
// mtimes). Prints nothing when the path is missing.
export const fingerprintFn = [
  "ff_fp() {",
  '  if [ -L "$1" ]; then printf \'link:%s\' "$(readlink "$1")";',
  '  elif [ -f "$1" ]; then printf \'file:%s\' "$(shasum -a 256 < "$1" | cut -d" " -f1)";',
  '  elif [ -d "$1" ]; then printf \'tree:%s\' "$( (cd "$1" && find . -type f -print0 | sort -z | xargs -0 shasum -a 256) | shasum -a 256 | cut -d" " -f1)";',
  "  fi",
  "}",
].join("\n");

// The prelude, after a Machine's `shell.init` (ADR 0020) when it has one.
// It runs first, so the prelude only appends to what it sets, and with
// stdin closed, so it cannot read the secrets an Apply sends there.
export const preludeFor = (init: string | undefined): string =>
  init === undefined ? prelude : [`{ ${init}\n} </dev/null`, prelude].join("\n");
