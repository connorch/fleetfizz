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
export const prelude = [
  // JSON-escapes $1 for embedding inside a double-quoted JSON string.
  `ff_json() { printf '%s' "$1" | sed -e 's/\\\\/\\\\\\\\/g' -e 's/"/\\\\"/g' | tr -d '\\n'; }`,
  `ff_state() { printf 'ff-state %s\\n' "$1"; }`,
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
