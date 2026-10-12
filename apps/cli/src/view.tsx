// The Ledger drawn with Ink: one component for every output. In a terminal,
// live.tsx renders it and Ink redraws it as the state changes; everywhere else
// (a pipe, the end of a live Ship, `fizz report`, tests) `ledgerText` renders
// it once with `renderToString`.
//
// Live, every line is cut at the terminal's edge instead of wrapping, so the
// frame is exactly as tall as its lines, and the view keeps it shorter than
// the window: Ink cannot redraw a frame taller than the window in place.
import { Box, renderToString, Text, type TextProps } from "ink";
import { createContext, useContext, type ReactNode } from "react";

import {
  duration,
  tally,
  type Item,
  type LedgerState,
  type MachineEntry,
  type Note,
} from "./ledger.ts";

export type Tone = "dim" | "bold" | "ok" | "fail" | "skip" | "run" | "ask";
const TONE: Record<Tone, TextProps> = {
  dim: { dimColor: true },
  bold: { bold: true },
  ok: { color: "green" },
  fail: { color: "red", bold: true },
  skip: { color: "yellow" },
  run: { color: "blue" },
  ask: { color: "magenta", bold: true },
};

// How the view is being drawn. `color` is off when stdout is not a terminal
// or NO_COLOR is set (chalk alone does not check NO_COLOR).
interface Mode {
  readonly color: boolean;
  // A live frame: lines are cut, not wrapped, and FAIL output keeps its tail.
  readonly live: boolean;
}
const ModeContext = createContext<Mode>({ color: false, live: false });

export const T = (props: { tone?: Tone | undefined; children: ReactNode }) => {
  const { color } = useContext(ModeContext);
  return (
    <Text {...(color && props.tone !== undefined ? TONE[props.tone] : {})}>{props.children}</Text>
  );
};

// One line. Live, it is cut at the terminal's edge.
export const Line = (props: { indent?: number; tone?: Tone | undefined; children: ReactNode }) => {
  const { live } = useContext(ModeContext);
  return (
    <Box paddingLeft={props.indent ?? 0}>
      <Text wrap={live ? "truncate-end" : "wrap"}>
        <T tone={props.tone}>{props.children}</T>
      </Text>
    </Box>
  );
};

// A column of fixed width, so the columns line up across Machines.
const Cell = (props: {
  width: number;
  right?: boolean;
  tone?: Tone | undefined;
  children: string;
}) => (
  <Box width={props.width} flexShrink={0} justifyContent={props.right ? "flex-end" : "flex-start"}>
    <Text wrap="truncate-end">
      <T tone={props.tone}>{props.children}</T>
    </Text>
  </Box>
);

const value = (i: Item): string =>
  i.to === undefined
    ? (i.from ?? "")
    : i.from === undefined
      ? `+ ${i.to}`
      : i.from === i.to
        ? i.to
        : `${i.from} -> ${i.to}`;

// What happened to an item, or what will.
const noteOf = (i: Item): { text: string; tone: Tone } => {
  switch (i.status) {
    case "running":
      return { text: i.doing ?? "running", tone: "run" };
    case "failed":
      return { text: "FAIL", tone: "fail" };
    case "skipped":
      return { text: "SKIP", tone: "skip" };
    case "ok":
      if (i.kind === "config") return { text: "copied", tone: "dim" };
      if (i.kind === "repo") {
        return i.from !== undefined && i.from === i.to
          ? { text: `rebuilt${i.reason === undefined ? "" : `: ${i.reason}`}`, tone: "ok" }
          : { text: "installed", tone: "ok" };
      }
      return { text: i.reason ?? "done", tone: "ok" };
    case "idle":
      if (i.changes) return { text: i.reason ?? "", tone: "dim" };
      return { text: i.kind === "repo" ? "up to date" : "", tone: "dim" };
  }
};

const elapsed = (started: number | undefined, ended: number | undefined, now: number) =>
  started === undefined ? "" : duration((ended ?? now) - started);

// A live frame keeps this much output under a FAIL while the Ship runs; every
// other rendering has all of it.
const LIVE_OUTPUT = 12;
// `key` names whose output it is, so keys stay unique in one list.
const outputLines = (
  key: string,
  output: ReadonlyArray<string>,
  indent: number,
  cut: boolean,
): ReactNode[] => {
  const hidden = cut ? Math.max(0, output.length - LIVE_OUTPUT) : 0;
  return [
    ...(hidden > 0
      ? [
          <Line key={`${key}/earlier`} indent={indent} tone="dim">
            ({hidden} earlier lines)
          </Line>,
        ]
      : []),
    ...output.slice(hidden).map((line, n) => (
      <Line key={`${key}/${n}`} indent={indent}>
        {line}
      </Line>
    )),
  ];
};

interface Widths {
  readonly name: number;
  readonly item: number;
  readonly value: number;
  readonly note: number;
  readonly time: number;
}

// The Machine's tag (OK, FAIL, ...) and what follows it: why, or how long.
const headOf = (
  m: MachineEntry,
  now: number,
): { tag: string; tone?: Tone; rest: string; restTone?: Tone } => {
  const time = elapsed(m.started, m.ended, now);
  const upToDate = !m.items.some((i) => i.changes);
  switch (m.status) {
    case "checking":
    case "waiting":
      return { tag: "", rest: m.status, restTone: "dim" };
    case "planned":
      // A dry run ends here, so a plan that already failed says so.
      return m.items.some((i) => i.status === "failed")
        ? { tag: "FAIL", tone: "fail", rest: "" }
        : { tag: "", rest: upToDate ? "up to date" : "", restTone: "dim" };
    case "running":
      return { tag: "RUN", tone: "run", rest: time, restTone: "dim" };
    case "ok":
      return { tag: "OK", tone: "ok", rest: upToDate ? "up to date" : time, restTone: "dim" };
    case "skipped":
      return { tag: "SKIP", tone: "skip", rest: m.detail ?? "" };
    case "failed":
      return m.detail === undefined
        ? { tag: "FAIL", tone: "fail", rest: time, restTone: "dim" }
        : { tag: "FAIL", tone: "fail", rest: m.detail };
  }
};

const MachineHead = (props: { m: MachineEntry; w: Widths; now: number }) => {
  const head = headOf(props.m, props.now);
  return (
    <Box columnGap={2}>
      <Cell width={props.w.name} tone="bold">
        {props.m.name}
      </Cell>
      <Cell width={4} tone={head.tone}>
        {head.tag}
      </Cell>
      <Line tone={head.restTone}>{head.rest}</Line>
    </Box>
  );
};

const ItemLine = (props: { i: Item; w: Widths; now: number }) => {
  const { i, w, now } = props;
  const note = noteOf(i);
  const idle = i.status === "idle" && !i.changes ? "dim" : undefined;
  return (
    <Box paddingLeft={4} columnGap={2}>
      <Cell width={w.item} tone={idle}>
        {i.name}
      </Cell>
      <Cell width={w.value} tone={idle}>
        {value(i)}
      </Cell>
      <Cell width={w.note} tone={note.tone}>
        {note.text}
      </Cell>
      {w.time > 0 && (
        <Cell width={w.time} right tone="dim">
          {elapsed(i.started, i.ended, now)}
        </Cell>
      )}
      {i.detail !== undefined && <Line>{i.detail}</Line>}
    </Box>
  );
};

export interface ViewOptions {
  // Every item, not only the ones that change.
  readonly full: boolean;
  readonly now: number;
  // Live only: the most lines the frame may take.
  readonly height?: number;
  // A line under the Ship once it ended ("full report: fizz report").
  readonly hint?: string;
}

export const LedgerView = (props: { state: LedgerState } & ViewOptions) => {
  const { state, full, now, height } = props;
  const { live } = useContext(ModeContext);
  const running = live && state.ended === undefined;
  const shownItems = (m: MachineEntry) =>
    m.items.filter((i) => full || i.changes || i.status === "failed" || i.status === "skipped");
  const visible = state.machines.flatMap(shownItems);
  const width = (texts: ReadonlyArray<string>) => Math.max(0, ...texts.map((t) => t.length));
  const w: Widths = {
    name: width(state.machines.map((m) => m.name)),
    item: width(visible.map((i) => i.name)),
    value: width(visible.map(value)),
    note: width(visible.map((i) => noteOf(i).text)),
    time: width(visible.map((i) => elapsed(i.started, i.ended, now))),
  };

  // Each Machine is its line plus the lines under it.
  const blocks = state.machines.map((m) => ({
    m,
    head: <MachineHead key={m.name} m={m} w={w} now={now} />,
    body: [
      ...shownItems(m).flatMap((i) => [
        <ItemLine key={`${m.name}/${i.kind}:${i.name}`} i={i} w={w} now={now} />,
        ...(i.output === undefined
          ? []
          : outputLines(`${m.name}/${i.kind}:${i.name}`, i.output, 6, running)),
      ]),
      ...(m.output === undefined ? [] : outputLines(m.name, m.output, 4, running)),
    ],
  }));

  const legend =
    state.ended === undefined
      ? `f ${full ? "changes only" : "full list"}  ·  ctrl-c stop`
      : undefined;
  // Room for Machines: the frame also has a blank line above them, and a
  // blank line and the legend below.
  const room = height === undefined ? Infinity : height - (legend === undefined ? 1 : 3);
  const count = (bs: typeof blocks) => bs.reduce((n, b) => n + 1 + b.body.length, 0);
  // Too tall for the window: Machines that are not running or failing show
  // only their own line, and past that the frame is cut.
  const fitted =
    count(blocks) <= room
      ? blocks
      : blocks.map((b) =>
          b.m.status === "running" || b.m.status === "failed" ? b : { ...b, body: [] },
        );
  const lines = fitted.flatMap((b) => [b.head, ...b.body]);
  const shown = lines.length <= room ? lines : lines.slice(0, Math.max(0, room - 1));
  const hidden = count(blocks) - shown.length;

  const t = tally(state);
  return (
    <Box flexDirection="column" marginTop={1}>
      {shown}
      {shown.length < lines.length && <Line tone="dim">…</Line>}
      {state.ended !== undefined && (
        <Box marginTop={1}>
          <T tone={t.failed === 0 ? "ok" : undefined}>
            {state.dryRun ? "planned" : "ok"} {t.ok}
          </T>
          <Text>{`  skipped ${t.skipped}  `}</Text>
          <T tone={t.failed > 0 ? "fail" : undefined}>failed {t.failed}</T>
          {!state.dryRun && <T tone="dim">{`  in ${duration(state.ended - state.started)}`}</T>}
        </Box>
      )}
      {state.ended !== undefined && props.hint !== undefined && (
        <Line tone="dim">{props.hint}</Line>
      )}
      {legend !== undefined && (
        <Box marginTop={1}>
          <Line tone="dim">
            {legend}
            {hidden > 0 && `  ·  ${hidden} lines hidden to fit the window`}
          </Line>
        </Box>
      )}
    </Box>
  );
};

export const NoteLine = (props: { note: Note }) => {
  const { kind, text } = props.note;
  return kind === "ask" ? (
    <Text>
      <T tone="ask">?</T> {text}
    </Text>
  ) : kind === "answer" ? (
    <T tone="dim">{`  -> ${text}`}</T>
  ) : (
    <Text>{text}</Text>
  );
};

export const Styled = (props: Mode & { children: ReactNode }) => (
  <ModeContext.Provider value={{ color: props.color, live: props.live }}>
    {props.children}
  </ModeContext.Provider>
);

// Color only for a terminal, and never with NO_COLOR.
export const colorful = (): boolean =>
  Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;

// Long lines wrap at the terminal's width, or not at all in a pipe.
const columns = () => process.stdout.columns ?? 10_000;

// Renders once, for printing.
export const toText = (node: ReactNode, color: boolean = colorful()): string =>
  renderToString(
    <Styled color={color} live={false}>
      {node}
    </Styled>,
    { columns: columns() },
  );

export const ledgerText = (state: LedgerState, options: ViewOptions, color?: boolean) =>
  toText(<LedgerView state={state} {...options} />, color);

export const noteText = (note: Note, color?: boolean) => toText(<NoteLine note={note} />, color);
