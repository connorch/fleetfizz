import type { FleetConfig } from "@fleetfizz/config";

// The config the landing page shows. Typed as the config as written
// (FleetConfig's Encoded side), so a schema change that this example no
// longer fits fails the typecheck, and the test decodes it with the CLI's own
// parser for the runtime rules.
export const EXAMPLE: typeof FleetConfig.Encoded = {
  version: "0.14.0",
  machines: ["mac-studio", "macbook-pro", "homelab"],
  repos: {
    cloneRoot: [{ machines: ["mac-studio"], path: "/Volumes/Stack/clones" }],
    items: {
      t3code: {
        origin: "connorch/t3code",
        ref: "main",
        platforms: ["darwin"],
        install: "pnpm install && pnpm build",
        outputs: ["~/Applications/T3 Code.app"],
      },
      dotfiles: { origin: "connorch/dotfiles", ref: "main", install: "./install.sh" },
    },
  },
  pnpm: { items: { vercel: "^59.25.4", wrangler: "^4.136.3" } },
};

// A comment above each top-level section.
const COMMENTS: Partial<Record<keyof typeof FleetConfig.Encoded, string>> = {
  version: "The fleetfizz every Machine runs.",
  machines: "The Fleet: every Machine a Ship touches.",
  repos: "Tracked Repos, installed from origin on every Machine.",
  pnpm: "Globals, installed with pnpm (or npm, bun, vp).",
};

export interface Token {
  kind: "key" | "string" | "version" | "comment" | "plain";
  text: string;
}

// Objects and arrays whose whole line, key and comma included, fits in
// this many characters stay on one line.
const INLINE = 80;

// A value as it reads on one line: `{ "a": 1, "b": [2, 3] }`.
const oneLine = (value: unknown): string => {
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(oneLine).join(", ")}]`;
  const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${oneLine(v)}`);
  return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
};

// The example as JSONC, tokenized for coloring. `exampleText` is the same
// characters joined, which the parser reads.
export function exampleTokens(): Token[] {
  const out: Token[] = [];
  const plain = (text: string) => out.push({ kind: "plain", text });
  // `lead` is what precedes the value on its line: its key and ": ".
  const emit = (value: unknown, indent: string, lead = "", comments?: Record<string, string>) => {
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
    const inline = !comments && `${indent}${lead}${oneLine(value)},`.length <= INLINE;
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
      const lead = key === undefined ? "" : `${JSON.stringify(key)}: `;
      if (key !== undefined) {
        out.push({ kind: "key", text: JSON.stringify(key) });
        plain(": ");
      }
      emit(v, inner, lead);
      const last = i === entries.length - 1;
      plain(inline ? (last ? pad : ", ") : last ? "\n" : ",\n");
    });
    plain(inline ? close : `${indent}${close}`);
  };
  emit(EXAMPLE, "", "", COMMENTS);
  return out;
}

export const exampleText = () =>
  exampleTokens()
    .map((t) => t.text)
    .join("");
