import { cn } from "@fleetfizz/ui/lib/utils";

// The last frame of a `fizz ship`, laid out the way the CLI's Ledger renders
// it (apps/cli/src/ledger.ts `rows`): notes above, then one line per Machine
// in config order with a line under it for each item that changed, the tally,
// and the legend. The run itself is invented: three Machines, one Question.

type Style = "dim" | "bold" | "ok" | "fail" | "skip" | "run" | "ask";
interface Segment {
  readonly text: string;
  readonly style?: Style;
}
type Row = ReadonlyArray<Segment>;

interface Item {
  readonly name: string;
  readonly value: string;
  readonly note: string;
  readonly time: string;
}
interface Machine {
  readonly name: string;
  readonly head: string;
  readonly items: ReadonlyArray<Item>;
}

const NOTES: ReadonlyArray<Row> = [
  [{ text: "3 machines from connors-mac-studio" }],
  [
    { text: "?", style: "ask" },
    { text: " wrangler 4.141.0 on connors-mac-studio is above ^4.136.3" },
  ],
  [{ text: "  -> bump the config to ^4.141.0", style: "dim" }],
];

const MACHINES: ReadonlyArray<Machine> = [
  { name: "connors-mac-studio", head: "up to date", items: [] },
  {
    name: "connors-macbook-pro",
    head: "5m 07s",
    items: [
      { name: "vp", value: "1.0.0 -> 1.1.0", note: "done", time: "16.6s" },
      { name: "connorch-t3code", value: "3f1a2b0 -> 9e02bb1", note: "installed", time: "4m 50s" },
    ],
  },
  {
    name: "homelab",
    head: "14.2s",
    items: [
      { name: "wrangler", value: "+ 4.141.0", note: "done", time: "4.1s" },
      { name: "connorch-dotfiles", value: "+ c7d9e02", note: "installed", time: "9.8s" },
    ],
  },
];

const TALLY: Row = [
  { text: "ok 3", style: "ok" },
  { text: "  skipped 0  failed 0" },
  { text: "  in 5m 12s", style: "dim" },
];
const LEGEND: Row = [{ text: "full report: fizz report", style: "dim" }];

// The same column rules as the CLI: every width is the widest visible value.
const rows = (): Row[] => {
  const items = MACHINES.flatMap((m) => m.items);
  const nameW = Math.max(...MACHINES.map((m) => m.name.length));
  const itemW = Math.max(...items.map((i) => i.name.length));
  const valueW = Math.max(...items.map((i) => i.value.length));
  const noteW = Math.max(...items.map((i) => i.note.length));
  const out: Row[] = [...NOTES, []];
  for (const m of MACHINES) {
    out.push([
      { text: m.name.padEnd(nameW), style: "bold" },
      { text: "  " },
      { text: "OK  ", style: "ok" },
      { text: "  " },
      { text: m.head, style: "dim" },
    ]);
    for (const i of m.items) {
      out.push([
        { text: `    ${i.name.padEnd(itemW)}  ${i.value.padEnd(valueW)}  ` },
        { text: i.note.padEnd(noteW), style: "ok" },
        { text: `  ${i.time.padStart(6)}`, style: "dim" },
      ]);
    }
  }
  out.push([], TALLY, LEGEND);
  return out;
};

const STYLE: Record<Style, string> = {
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
    <pre
      className={cn(
        "overflow-x-auto rounded-lg border border-white/10 bg-[#0B0F05]/90 p-5 font-mono text-[12.5px] leading-relaxed text-[#C9D0BC] backdrop-blur-sm",
        className,
      )}
    >
      <code>
        <span className="text-fizz">$</span> fizz ship{"\n"}
        {rows().map((row, r) => (
          <span key={r}>
            {row.map((s, i) => (
              <span key={i} className={s.style && STYLE[s.style]}>
                {s.text}
              </span>
            ))}
            {"\n"}
          </span>
        ))}
      </code>
    </pre>
  );
}
