import type { FleetConfig } from "@fleetfizz/config";

// The config the landing page shows. Typed as the schema's FleetConfig, so a
// schema change that this example no longer fits fails the typecheck, and
// the test decodes it with the CLI's own parser for the runtime rules.
export const EXAMPLE: FleetConfig = {
  machines: {
    "mac-studio": { clones: "/Volumes/Stack/clones" },
    "macbook-pro": {},
    homelab: {},
  },
  repos: [
    {
      origin: "connorch/t3code",
      ref: "main",
      platforms: ["darwin"],
      install: "pnpm install && pnpm build",
      outputs: ["~/Applications/T3 Code.app"],
    },
    { origin: "connorch/dotfiles", ref: "main", install: "./install.sh" },
  ],
  vp: {
    version: "1.1.0",
    node: "24.18.1",
    globals: { vercel: "^59.25.4", wrangler: "^4.136.3" },
  },
};

// A comment above each top-level section.
const COMMENTS: Partial<Record<keyof FleetConfig, string>> = {
  machines: "The Fleet: every Machine a Ship touches.",
  repos: "Tracked Repos, installed from origin on every Machine.",
  vp: "The vite-plus toolchain and its Globals.",
};

export interface Token {
  kind: "key" | "string" | "version" | "comment" | "plain";
  text: string;
}

// Objects and arrays that fit on one line stay on one line.
const INLINE = 80;

// The example as JSONC, tokenized for coloring. `exampleText` is the same
// characters joined, which the parser reads.
export function exampleTokens(): Token[] {
  const out: Token[] = [];
  const plain = (text: string) => out.push({ kind: "plain", text });
  const emit = (value: unknown, indent: string, comments?: Record<string, string>) => {
    // A string that starts with a digit, or a range's ^ or ~ before one, is a version.
    if (typeof value === "string") {
      const kind = /^[\^~]?\d/.test(value) ? "version" : "string";
      return out.push({ kind, text: JSON.stringify(value) });
    }
    if (typeof value !== "object" || value === null) return plain(JSON.stringify(value));
    const entries = Array.isArray(value)
      ? value.map((v) => [undefined, v] as const)
      : Object.entries(value).map(([k, v]) => [k, v] as const);
    const list = Array.isArray(value);
    const [open, close] = list ? ["[", "]"] : ["{", "}"];
    const inline = !comments && indent.length + JSON.stringify(value).length <= INLINE;
    const inner = inline ? indent : indent + "  ";
    // Inline objects get a space inside the braces; inline arrays do not.
    const pad = inline && !list && entries.length ? " " : "";
    plain(inline ? `${open}${pad}` : `${open}\n`);
    entries.forEach(([key, v], i) => {
      if (!inline) plain(inner);
      if (comments?.[key ?? ""]) {
        out.push({ kind: "comment", text: `// ${comments[key ?? ""]}` });
        plain(`\n${inner}`);
      }
      if (key !== undefined) {
        out.push({ kind: "key", text: JSON.stringify(key) });
        plain(": ");
      }
      emit(v, inner);
      const last = i === entries.length - 1;
      plain(inline ? (last ? pad : ", ") : last ? "\n" : ",\n");
    });
    plain(inline ? close : `${indent}${close}`);
  };
  emit(EXAMPLE, "", COMMENTS);
  return out;
}

export const exampleText = () =>
  exampleTokens()
    .map((t) => t.text)
    .join("");
