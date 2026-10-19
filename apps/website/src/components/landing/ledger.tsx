import { cn } from "@fleetfizz/ui/lib/utils";
import { CodeBlock } from "./code-block";

// A finished `fizz ship`, laid out the way the CLI draws it (apps/cli/src/
// view.tsx): notes above, then each Machine's line with its time and summary
// and, under it, one line per item that changed, its status first. The same
// columns run through every line. The run itself is invented: three
// Machines, one Question. Its bump edits the config, so every Machine also
// gets the new copy.

type Tone = "dim" | "bold" | "ok" | "fail" | "skip" | "run" | "ask";
interface Segment {
  readonly text: string;
  readonly tone?: Tone;
}
type Row = ReadonlyArray<Segment>;

interface Item {
  readonly status: string;
  readonly name: string;
  readonly value: string;
  readonly time: string;
}
interface Machine {
  readonly name: string;
  readonly time: string;
  readonly summary: Row;
  readonly items: ReadonlyArray<Item>;
}

const NOTES: ReadonlyArray<Row> = [
  [{ text: "3 machines from mac-studio" }],
  [{ text: "?", tone: "ask" }, { text: " vp:wrangler 4.141.0 on mac-studio is above ^4.136.3" }],
  [{ text: "  → bump the config to ^4.141.0", tone: "dim" }],
];

const MACHINES: ReadonlyArray<Machine> = [
  {
    name: "mac-studio",
    time: "0.4s",
    summary: [{ text: "1 of 1 done", tone: "ok" }],
    items: [{ status: "✓ copied", name: "config", value: "4c8e1f2 → b07d93a", time: "0.2s" }],
  },
  {
    name: "macbook-pro",
    time: "5m 07s",
    summary: [{ text: "3 of 3 done", tone: "ok" }],
    items: [
      { status: "✓ done", name: "vp:vp", value: "1.0.0 → 1.1.0", time: "16.6s" },
      {
        status: "✓ installed",
        name: "repos:t3code",
        value: "3f1a2b0 → 9e02bb1",
        time: "4m 50s",
      },
      { status: "✓ copied", name: "config", value: "4c8e1f2 → b07d93a", time: "0.3s" },
    ],
  },
  {
    name: "homelab",
    time: "14.2s",
    summary: [{ text: "3 of 3 done", tone: "ok" }],
    items: [
      { status: "✓ done", name: "vp:wrangler", value: "+ 4.141.0", time: "4.1s" },
      { status: "✓ installed", name: "repos:dotfiles", value: "+ c7d9e02", time: "9.8s" },
      { status: "✓ copied", name: "config", value: "4c8e1f2 → b07d93a", time: "0.3s" },
    ],
  },
];

const SUMMARY: Row = [
  { text: "3 updated", tone: "ok" },
  { text: "  in 5m 12s", tone: "dim" },
];

const GAP = "  ";
const INDENT = "  ";

// The CLI's column rules: every width is the widest value in that column,
// and a Machine's name spans the status, name, and value columns.
const rows = (): Row[] => {
  const items = MACHINES.flatMap((m) => m.items);
  const widest = (texts: string[]) => Math.max(0, ...texts.map((t) => t.length));
  const status = widest(items.map((i) => i.status));
  const item = INDENT.length + widest(items.map((i) => i.name));
  const nameAt = status + GAP.length + INDENT.length;
  const value = Math.max(
    widest(items.map((i) => i.value)),
    widest(MACHINES.map((m) => m.name)) - (nameAt + item + GAP.length),
  );
  const time = widest([...items.map((i) => i.time), ...MACHINES.map((m) => m.time)]);
  const out: Row[] = [...NOTES];
  MACHINES.forEach((m, n) => {
    out.push([]);
    out.push([
      { text: m.name.padEnd(nameAt + item + GAP.length + value), tone: "bold" },
      { text: `${GAP}${m.time.padStart(time)}${GAP}`, tone: "dim" },
      ...m.summary,
    ]);
    for (const i of m.items) {
      out.push([
        { text: i.status.padEnd(status), tone: "ok" },
        {
          text: `${GAP}${INDENT}${i.name.padEnd(item - INDENT.length)}${GAP}${i.value.padEnd(value)}`,
        },
        { text: `${GAP}${i.time.padStart(time)}`, tone: "dim" },
      ]);
    }
    if (n === MACHINES.length - 1) out.push([], SUMMARY);
  });
  return out;
};

const TONE: Record<Tone, string> = {
  dim: "text-white/40",
  bold: "font-bold text-white",
  ok: "text-fizz",
  fail: "font-bold text-red-400",
  skip: "text-amber-300",
  run: "text-sky-300",
  ask: "font-bold text-fuchsia-300",
};

// Always dark: it is a terminal, whatever the theme.
export function Ledger({ className }: { className?: string }) {
  return (
    <CodeBlock
      className={cn(
        "border-white/10 bg-[#0B0F05]/90 text-[#C9D0BC] backdrop-blur-sm [&_[data-slot=scroll-area-thumb]]:bg-white/20",
        className,
      )}
    >
      <code>
        <span className="text-fizz">$</span> fizz ship{"\n"}
        {rows().map((row, r) => (
          <span key={r}>
            {row.map((s, i) => (
              <span key={i} className={s.tone && TONE[s.tone]}>
                {s.text}
              </span>
            ))}
            {"\n"}
          </span>
        ))}
      </code>
    </CodeBlock>
  );
}
