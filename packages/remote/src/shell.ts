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
// Puts vp's bin on PATH. A login shell has sourced vp's env file already, but
// over ssh Ubuntu's .bashrc returns before reaching it in a non-interactive
// shell, so every script does this itself (dash exits on `.` of a missing
// file, hence the check). A VP_HOME or legacy ~/.vite-plus layout keeps its
// bin elsewhere, so those go on PATH as well.
export const vpEnv = [
  `ff_env="\${XDG_CONFIG_HOME:-$HOME/.config}/vite-plus/env"`,
  `{ [ ! -f "$ff_env" ] || . "$ff_env"; }`,
  `export PATH="\${VP_HOME:-$HOME/.vite-plus}/bin:\${XDG_DATA_HOME:-$HOME/.local/share}/vite-plus/bin:$PATH"`,
].join("\n");

// Puts Homebrew on PATH for the same reason: over ssh, linux login shells
// skip the .bashrc line that does it. In the prelude, so repos' Install
// Commands find what brew installed. Appended, so a brew already on PATH wins.
const brewEnv = `export PATH="$PATH:/opt/homebrew/bin:/home/linuxbrew/.linuxbrew/bin"`;

export const prelude = [
  vpEnv,
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
