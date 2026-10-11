import { cn } from "@fleetfizz/ui/lib/utils";

// A `fizz ship` transcript, in the Ledger's real format: elapsed, Machine,
// tag, message. Captured from a three-Machine Ship and shortened.
type Tag = "INFO" | "PLAN" | "RUN" | "ASK" | "SKIP" | "OK" | "FAIL" | "DONE";

const LINES: ReadonlyArray<readonly [string, string, Tag, string]> = [
  ["0.0s", "fleet", "INFO", "3 machines, local connors-mac-studio"],
  ["1.9s", "connors-mac-studio", "PLAN", "config · 2 repos up to date"],
  [
    "2.2s",
    "connors-macbook-pro",
    "PLAN",
    "config · vp 1.0.0 -> 1.1.0 · connorch-t3code install (new commit 9e02bb1)",
  ],
  [
    "2.6s",
    "homelab",
    "PLAN",
    "config · +wrangler 4.136.3 · connorch-dotfiles install (never installed)",
  ],
  ["2.6s", "fleet", "ASK", "wrangler 4.141.0 on connors-mac-studio is above ^4.136.3"],
  ["4.1s", "fleet", "INFO", "bumped wrangler to ^4.141.0 in fleet.config.jsonc"],
  ["4.3s", "connors-mac-studio", "OK", "up to date"],
  ["4.3s", "connors-macbook-pro", "RUN", "vp upgrade 1.1.0"],
  ["4.4s", "homelab", "RUN", "install wrangler@4.141.0"],
  ["9.8s", "homelab", "RUN", "connorch-dotfiles install"],
  ["14.2s", "homelab", "OK", "vp · connorch-dotfiles installed"],
  ["21.0s", "connors-macbook-pro", "RUN", "connorch-t3code install"],
  ["312s", "connors-macbook-pro", "OK", "vp · connorch-t3code installed · 1 repo up to date"],
  ["312s", "fleet", "DONE", "ok 3  skipped 0  failed 0"],
];

// Mirrors the CLI's ANSI styling per tag.
const TAG_CLASS: Record<Tag, string> = {
  INFO: "font-bold text-white",
  PLAN: "text-white/40",
  RUN: "text-sky-300",
  ASK: "text-fuchsia-300",
  SKIP: "text-amber-300",
  OK: "text-fizz",
  FAIL: "font-bold text-red-400",
  DONE: "font-bold text-fizz",
};

const WIDTH = Math.max(...LINES.map(([, who]) => who.length));

// Always dark: it is a terminal, whatever the theme.
export function Ledger({ className }: { className?: string }) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-lg border border-white/10 bg-[#0B0F05]/90 p-5 font-mono text-[12.5px] leading-relaxed text-[#C9D0BC] backdrop-blur-sm",
        className,
      )}
    >
      <code>
        <span className="text-fizz">$</span> fizz ship{"\n"}
        {LINES.map(([t, who, tag, msg], i) => (
          <span key={i}>
            <span className="text-white/35">{t.padStart(5)}</span>
            {"  "}
            {who.padEnd(WIDTH)}
            {"  "}
            <span className={TAG_CLASS[tag]}>{tag.padEnd(4)}</span>
            {"  "}
            {msg}
            {"\n"}
          </span>
        ))}
      </code>
    </pre>
  );
}
