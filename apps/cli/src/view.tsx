// The Ledger drawn with Ink: one component for every output. In a terminal,
// live.tsx renders it and Ink redraws it as the state changes; everywhere else
// (a pipe, the end of a live Ship, `fizz report`, tests) `ledgerText` renders
// it once with `renderToString`.
//
// Live, every line is cut at the terminal's edge instead of wrapping, so the
// frame is exactly as tall as its lines, and the view keeps it shorter than
// the window: Ink cannot redraw a frame taller than the window in place.
import spinners from "cli-spinners";
import { Box, renderToString, Text, type TextProps } from "ink";
import { createContext, useContext, type ReactNode } from "react";

import {
  duration,
  outcomeOf,
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
  // A live frame: lines are cut, not wrapped, and failure output keeps its tail.
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
        : `${i.from} → ${i.to}`;

interface Part {
  readonly text: string;
  readonly tone?: Tone;
}

// A running item's glyph: live, a spinner turned by the clock, so every
// running item spins in step; printed once, a still arrow. live.tsx ticks the
// clock at the spinner's interval.
export const SPINNER = spinners.dots;
const runGlyph = (live: boolean, now: number): string =>
  (live ? SPINNER.frames[Math.floor(now / SPINNER.interval) % SPINNER.frames.length] : undefined) ??
  "▸";

// An unchanged item has no status; a record Item says so at the end instead.
const unchanged = (i: Item) => ({
  text: "",
  detail: i.kind === "record" || i.kind === "config" ? "up to date" : undefined,
});

// An item's status, first on its line, and the detail at its end. Outcomes
// are past tense, work in progress ends in -ing, and `queued` (a Ship) or
// `planned` (a dry run) has not started. `glyph` leads a running item.
const statusOf = (
  i: Item,
  dryRun: boolean,
  glyph: string,
): Part & { readonly detail?: string | undefined } => {
  switch (i.status) {
    case "running":
      return { text: `${glyph} ${i.doing ?? "running"}`, tone: "run" };
    case "failed":
      return { text: "✗ failed", tone: "fail", detail: i.detail };
    case "skipped":
      return { text: "– skipped", tone: "skip", detail: i.detail };
    case "ok":
      // Only its upkeep ran (a Managed Clone's reset, an upgrade that found
      // nothing newer): still unchanged.
      if (!i.changes) return unchanged(i);
      if (i.kind === "config") return { text: "✓ copied", tone: "ok" };
      if (i.kind === "record") {
        return i.from !== undefined && i.from === i.to
          ? { text: "✓ rebuilt", tone: "ok", detail: i.reason }
          : { text: "✓ installed", tone: "ok" };
      }
      return { text: "✓ done", tone: "ok", detail: i.reason };
    case "idle":
      if (i.changes)
        return { text: dryRun ? "· planned" : "· queued", tone: "dim", detail: i.reason };
      return unchanged(i);
  }
};

// A Machine's items, counted. A skipped item does not change; a failed one
// did, or was meant to.
const countsOf = (m: MachineEntry) => {
  const changes = m.items.filter((i) => i.changes && i.status !== "skipped");
  return {
    changes: changes.length,
    done: changes.filter((i) => i.status === "ok").length,
    failed: m.items.filter((i) => i.status === "failed").length,
    skipped: m.items.filter((i) => i.status === "skipped").length,
  };
};

// Nothing left to run: Apply ended, or a dry run's plan is made (it never
// runs Apply). A Machine with nothing to change still copies the config.
const settled = (m: MachineEntry, dryRun: boolean) =>
  (dryRun && m.status === "planned") || m.status === "ok" || m.status === "failed";

// Nothing to change, and nothing left to run: its time does not matter.
const upToDate = (m: MachineEntry, dryRun: boolean) => {
  const c = countsOf(m);
  return c.changes === 0 && c.skipped === 0 && settled(m, dryRun);
};

// A Machine's summary, at the end of its line: what it is doing while ssh
// connects and the Check runs, then how far its items got, in their colors,
// green only once it is settled. A Machine that was skipped or failed as a
// whole says so, then why. `glyph` leads what is running.
const summaryOf = (m: MachineEntry, dryRun: boolean, glyph: string): ReadonlyArray<Part> => {
  if (m.status === "checking")
    return [{ text: `${glyph} ${m.connected === true ? "checking" : "connecting"}`, tone: "run" }];
  if (m.status === "waiting") return [{ text: "✓ checked", tone: "ok" }];
  if (m.status === "running" && m.connected !== true)
    return [{ text: `${glyph} connecting`, tone: "run" }];
  if (m.status === "skipped") {
    return [{ text: "– skipped", tone: "skip" }, { text: `  ${m.detail ?? ""}` }];
  }
  if (m.status === "failed" && m.detail !== undefined) {
    return [{ text: "✗ failed", tone: "fail" }, { text: `  ${m.detail}` }];
  }
  const { changes, done, failed, skipped } = countsOf(m);
  // Nothing to change, but its Apply still runs (the config copy, upkeep).
  if (changes === 0 && skipped === 0 && m.status === "running") {
    return [{ text: "applying", tone: "dim" }];
  }
  if (changes === 0 && skipped === 0) {
    return [{ text: "up to date", tone: settled(m, dryRun) ? "ok" : "dim" }];
  }
  const finished = m.status === "ok" || m.status === "failed";
  const parts: Part[] = [];
  if (dryRun && m.status === "planned") {
    if (changes > failed) parts.push({ text: `${changes - failed} to change`, tone: "dim" });
  } else if (changes > 0 && (!finished || done > 0)) {
    // Green once every change is done; a finished Machine that got nothing
    // done says only what failed.
    parts.push({ text: `${done} of ${changes} done`, tone: done === changes ? "ok" : "dim" });
  }
  if (failed > 0) parts.push({ text: `${failed} failed`, tone: "fail" });
  if (skipped > 0) parts.push({ text: `${skipped} skipped`, tone: "skip" });
  return joined(parts);
};

const joined = (parts: ReadonlyArray<Part>): ReadonlyArray<Part> =>
  parts.flatMap((part, n) => (n === 0 ? [part] : [{ text: ", ", tone: "dim" as const }, part]));

// The Ship's summary, under its Machines: the Machines counted by how they
// ended, in the words and colors of their own summaries, zero counts left
// out. A Machine a stopped Ship never reached is not counted.
const shipSummary = (state: LedgerState): ReadonlyArray<Part> => {
  const outcomes = state.machines.map((m) => {
    const outcome = outcomeOf(m, state.dryRun);
    if (outcome !== "ok") return outcome;
    const { changes, skipped } = countsOf(m);
    if (changes > 0) return state.dryRun ? "to change" : "updated";
    // Nothing changed; one that skipped an item says so, as its own line does.
    return skipped > 0 ? "skipped" : "up to date";
  });
  const counted = (outcome: (typeof outcomes)[number], tone: Tone): Part[] => {
    const n = outcomes.filter((o) => o === outcome).length;
    return n === 0 ? [] : [{ text: `${n} ${outcome}`, tone }];
  };
  const parts = joined([
    ...counted("updated", "ok"),
    ...counted("to change", "dim"),
    ...counted("up to date", "ok"),
    ...counted("failed", "fail"),
    ...counted("skipped", "skip"),
  ]);
  return parts.length === 0 ? [{ text: "nothing changed", tone: "dim" }] : parts;
};

const elapsed = (started: number | undefined, ended: number | undefined, now: number) =>
  started === undefined ? "" : duration((ended ?? now) - started);

// A Machine's time: its Check (which starts with the Ship) until it is
// planned, then its Apply.
const machineTime = (m: MachineEntry, shipStarted: number, now: number) =>
  m.status === "checking" || m.status === "waiting"
    ? elapsed(shipStarted, m.checked, now)
    : elapsed(m.started, m.ended, now);

const Parts = (props: { parts: ReadonlyArray<Part> }) => (
  <Line>
    {props.parts.map((part, n) => (
      <T key={n} tone={part.tone}>
        {part.text}
      </T>
    ))}
  </Line>
);

// The columns every line shares. An item line is its status, its name
// (indented under the Machine's), its version or commit, its time, and its
// detail; a Machine line is its name across the first three, then its time
// and its summary.
interface Widths {
  readonly status: number;
  readonly item: number;
  readonly value: number;
  readonly time: number;
}
const GAP = 2;
const INDENT = 2;
// Where an item's name starts: output under an item lines up with it.
const nameAt = (w: Widths) => w.status + GAP + INDENT;

// A live frame keeps this much output under a failure while the Ship runs;
// every other rendering has all of it.
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
        <T tone="fail">│ </T>
        {line}
      </Line>
    )),
  ];
};

const MachineLine = (props: {
  m: MachineEntry;
  w: Widths;
  dryRun: boolean;
  shipStarted: number;
  now: number;
  glyph: string;
}) => {
  const { m, w } = props;
  return (
    <Box columnGap={GAP}>
      <Cell width={nameAt(w) + w.item + GAP + w.value} tone="bold">
        {m.name}
      </Cell>
      {w.time > 0 && (
        <Cell width={w.time} right tone="dim">
          {upToDate(m, props.dryRun) ? "" : machineTime(m, props.shipStarted, props.now)}
        </Cell>
      )}
      <Parts parts={summaryOf(m, props.dryRun, props.glyph)} />
    </Box>
  );
};

const ItemLine = (props: { i: Item; w: Widths; dryRun: boolean; now: number; glyph: string }) => {
  const { i, w } = props;
  const status = statusOf(i, props.dryRun, props.glyph);
  const quiet = i.status === "idle" ? "dim" : undefined;
  return (
    <Box columnGap={GAP}>
      <Cell width={w.status} tone={status.tone}>
        {status.text}
      </Cell>
      <Cell width={INDENT + w.item} tone={quiet}>
        {`${" ".repeat(INDENT)}${i.name}`}
      </Cell>
      <Cell width={w.value} tone={quiet}>
        {value(i)}
      </Cell>
      {w.time > 0 && (
        <Cell width={w.time} right tone="dim">
          {elapsed(i.started, i.ended, props.now)}
        </Cell>
      )}
      {status.detail !== undefined && <Line tone={quiet}>{status.detail}</Line>}
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
  const { dryRun } = state;
  const { live } = useContext(ModeContext);
  const running = live && state.ended === undefined;
  const glyph = runGlyph(live, now);
  // An item that does not change shows while one of its Steps runs (a
  // Managed Clone's upkeep), so the Ledger always says what is running.
  const shownItems = (m: MachineEntry) =>
    m.items.filter(
      (i) =>
        full ||
        i.changes ||
        i.status === "failed" ||
        i.status === "skipped" ||
        i.status === "running",
    );
  // Resolve, while it runs: one line under the Machines, shaped like an item.
  const resolve: Item | undefined =
    state.resolving === undefined || state.ended !== undefined
      ? undefined
      : {
          name: "versions and commits",
          kind: "range",
          from: `${state.resolving.items} items`,
          changes: false,
          status: "running",
          doing: "resolving",
          steps: [],
          started: state.resolving.started,
        };
  const visible = [
    ...state.machines.flatMap(shownItems),
    ...(resolve === undefined ? [] : [resolve]),
  ];
  const width = (texts: ReadonlyArray<string>) => Math.max(0, ...texts.map((t) => t.length));
  const item = width(visible.map((i) => i.name));
  const status = width(visible.map((i) => statusOf(i, dryRun, glyph).text));
  const w: Widths = {
    status,
    item,
    // Wide enough for every value, and for the longest Machine name, which
    // spans the status, name, and value columns.
    value: Math.max(
      width(visible.map(value)),
      width(state.machines.map((m) => m.name)) - (status + GAP + INDENT + item + GAP),
    ),
    time: width([
      ...visible.map((i) => elapsed(i.started, i.ended, now)),
      ...state.machines.map((m) => machineTime(m, state.started, now)),
    ]),
  };

  // Each Machine is its line plus the lines under it.
  const blocks = state.machines.map((m) => ({
    m,
    head: (
      <MachineLine
        key={m.name}
        m={m}
        w={w}
        dryRun={dryRun}
        shipStarted={state.started}
        now={now}
        glyph={glyph}
      />
    ),
    body: [
      ...(m.output === undefined ? [] : outputLines(m.name, m.output, nameAt(w), running)),
      ...shownItems(m).flatMap((i) => [
        <ItemLine
          key={`${m.name}/${i.kind}:${i.name}`}
          i={i}
          w={w}
          dryRun={dryRun}
          now={now}
          glyph={glyph}
        />,
        ...(i.output === undefined
          ? []
          : outputLines(`${m.name}/${i.kind}:${i.name}`, i.output, nameAt(w), running)),
      ]),
    ],
  }));

  const legend =
    state.ended === undefined
      ? `f ${full ? "changes only" : "full list"}  ·  ctrl-c stop`
      : undefined;
  // Room for Machines: the frame also has a blank line above them, the
  // resolve line and a blank line before it, and a blank line and the legend
  // below.
  const room =
    height === undefined
      ? Infinity
      : height - (legend === undefined ? 1 : 3) - (resolve === undefined ? 0 : 2);
  // A blank line separates Machines.
  const count = (bs: typeof blocks) =>
    bs.reduce((n, b) => n + 1 + b.body.length, Math.max(0, bs.length - 1));
  // Too tall for the window: every Machine keeps its own line (its summary
  // says how far it got), and running Machines share the rows left in config
  // order, each cut with "…". A finished or failed Machine shows only its line:
  // its items and output print in full when the Ship ends. Past that, the
  // frame is cut.
  const fits = count(blocks) <= room;
  let spare = room - count(blocks.map((b) => ({ ...b, body: [] })));
  let cuts = 0;
  const fitted: typeof blocks = [];
  for (const b of blocks) {
    const open = b.m.status === "running";
    if (fits) fitted.push(b);
    else if (open && b.body.length <= spare) {
      fitted.push(b);
      spare -= b.body.length;
    } else if (open && spare > 0) {
      const ellipsis = (
        <Line key={`${b.m.name}/cut`} indent={nameAt(w)} tone="dim">
          …
        </Line>
      );
      fitted.push({ ...b, body: [...b.body.slice(0, spare - 1), ellipsis] });
      spare = 0;
      cuts += 1;
    } else fitted.push({ ...b, body: [] });
  }
  const lines = fitted.flatMap((b, n) => [
    ...(n === 0 ? [] : [<Text key={`${b.m.name}/gap`}> </Text>]),
    b.head,
    ...b.body,
  ]);
  const shown = lines.length <= room ? lines : lines.slice(0, Math.max(0, room - 1));
  const hidden = count(blocks) - (shown.length - cuts);
  // No room even for one Machine (a short window with a Question open): the
  // Question alone is drawn.
  if (room < 1) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      {shown}
      {shown.length < lines.length && <Line tone="dim">…</Line>}
      {resolve !== undefined && (
        <Box marginTop={1}>
          <ItemLine i={resolve} w={w} dryRun={dryRun} now={now} glyph={glyph} />
        </Box>
      )}
      {state.ended !== undefined && (
        <Box marginTop={1}>
          <Parts
            parts={[
              ...shipSummary(state),
              ...(dryRun
                ? []
                : [
                    { text: `  in ${duration(state.ended - state.started)}`, tone: "dim" as const },
                  ]),
            ]}
          />
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
    <T tone="dim">{`  → ${text}`}</T>
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

// A dim line after the Ledger, pointing somewhere ("log: fizz logs <id>").
export const hintText = (text: string, color?: boolean) => toText(<T tone="dim">{text}</T>, color);
