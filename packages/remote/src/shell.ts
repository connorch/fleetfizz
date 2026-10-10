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
