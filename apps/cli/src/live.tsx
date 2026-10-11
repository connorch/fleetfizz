// The live Ledger in a terminal: Ink draws `rows` and redraws them as the
// Ship's events change the state. `f` switches between the items that change
// and every item. Questions are asked here too, as a list of choices above the
// Machines, so Ink is the only thing reading keys. When the scope closes, the
// last frame stays in scrollback.
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { Box, render, Text, useInput, useStdin } from "ink";
import { useState, useSyncExternalStore } from "react";

import { rows, type LedgerStore, type Style } from "./ledger.ts";

// Ink colors for each Ledger style; plain output uses ANSI codes (ledger.ts).
const STYLE: Record<Style, { color?: string; bold?: boolean; dimColor?: boolean }> = {
  dim: { dimColor: true },
  bold: { bold: true },
  ok: { color: "green" },
  fail: { color: "red", bold: true },
  skip: { color: "yellow" },
  run: { color: "blue" },
  ask: { color: "magenta", bold: true },
};

// The Question being asked: its choices, and how to answer with one.
interface Asking {
  readonly titles: ReadonlyArray<string>;
  readonly answer: (index: number) => void;
}

// A value React can subscribe to.
const cell = <A,>(initial: A) => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: A) => {
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
type Cell<A> = ReturnType<typeof cell<A>>;

const LiveLedger = (props: {
  store: LedgerStore;
  asking: Cell<Asking | undefined>;
  color: boolean;
}) => {
  const { state, now } = useSyncExternalStore(props.store.subscribe, props.store.get);
  const asking = useSyncExternalStore(props.asking.subscribe, props.asking.get);
  const [full, setFull] = useState(false);
  const [cursor, setCursor] = useState(0);
  const { isRawModeSupported } = useStdin();
  useInput(
    (input, key) => {
      // Raw mode swallows the terminal's SIGINT; send it so the Ship is
      // interrupted the usual way (NodeRuntime.runMain).
      if (key.ctrl && input === "c") process.kill(process.pid, "SIGINT");
      else if (asking !== undefined && (key.upArrow || key.downArrow)) {
        const n = asking.titles.length;
        setCursor((c) => (c + (key.upArrow ? n - 1 : 1)) % n);
      } else if (asking !== undefined && key.return) {
        setCursor(0);
        asking.answer(cursor);
      } else if (input === "f") setFull((f) => !f);
    },
    { isActive: isRawModeSupported },
  );
  const style = (s: Style | undefined) => (props.color && s !== undefined ? STYLE[s] : {});
  return (
    <Box flexDirection="column">
      {asking?.titles.map((title, i) => (
        <Text key={`ask-${i}`} wrap="truncate-end">
          <Text {...style(i === cursor ? "ask" : "dim")}>{i === cursor ? "  › " : "    "}</Text>
          <Text {...style(i === cursor ? undefined : "dim")}>{title}</Text>
        </Text>
      ))}
      {rows(state, { full, now, live: true }).map((row, r) => (
        <Text key={r} wrap="truncate-end">
          {row.length === 0
            ? " "
            : row.map((segment, s) => (
                <Text key={s} {...style(segment.style)}>
                  {segment.text}
                </Text>
              ))}
        </Text>
      ))}
    </Box>
  );
};

export interface Choice<A> {
  readonly title: string;
  readonly value: A;
}

export interface Live {
  // Asks one Question by its choices; the Question itself is a Ledger note.
  // Undefined when there is no one to ask (no terminal to read keys from).
  readonly ask: (<A>(choices: ReadonlyArray<Choice<A>>) => Effect.Effect<A>) | undefined;
}

// Shows the Ledger until the scope closes.
export const startLive = Effect.fn("startLive")(function* (store: LedgerStore, color: boolean) {
  const asking = cell<Asking | undefined>(undefined);
  const view = <LiveLedger store={store} asking={asking} color={color} />;
  const instance = render(view, { exitOnCtrlC: false });
  // Draws the latest state and waits for it to reach the terminal before
  // unmounting: that last frame is what stays behind.
  yield* Effect.addFinalizer(() =>
    Effect.promise(async () => {
      instance.rerender(view);
      await instance.waitUntilRenderFlush();
      instance.unmount();
      await instance.waitUntilExit();
    }),
  );
  // Running items count up once a second.
  yield* Effect.forkScoped(Effect.repeat(store.tick, Schedule.spaced("1 second")));
  const live: Live = {
    ask: process.stdin.isTTY
      ? <A,>(choices: ReadonlyArray<Choice<A>>) =>
          Effect.callback<A>((resume) => {
            asking.set({
              titles: choices.map((c) => c.title),
              answer: (index) => {
                const choice = choices[index];
                if (choice === undefined) return;
                asking.set(undefined);
                resume(Effect.succeed(choice.value));
              },
            });
            return Effect.sync(() => asking.set(undefined));
          })
      : undefined,
  };
  return live;
});

// Outside a terminal nothing is redrawn and nothing is asked.
export const noLive: Live = { ask: undefined };

export const canRedraw = (): boolean =>
  Boolean(process.stdout.isTTY) && process.env.TERM !== "dumb";
