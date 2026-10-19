// The live Ledger in a terminal: Ink draws the LedgerView (view.tsx) and
// redraws it as the Ship's events change the state, always shorter than the
// window. `f` switches between the items that change and every item.
// Questions are asked here too, as a list of choices above the Machines, so
// Ink is the only thing reading keys. When the scope closes the live frame is
// erased; the Ship then prints its result once, as ordinary output.
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { Box, render, useInput, useStdin, useWindowSize } from "ink";
import { useState, useSyncExternalStore } from "react";

import type { LedgerStore } from "./ledger.ts";
import { LedgerView, Line, SPINNER, Styled, T } from "./view.tsx";

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
  const { rows } = useWindowSize();
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
  const choices = asking?.titles ?? [];
  return (
    <Styled color={props.color} live>
      <Box flexDirection="column">
        {choices.map((title, i) => (
          <Line key={i} tone={i === cursor ? undefined : "dim"}>
            <T tone={i === cursor ? "ask" : "dim"}>{i === cursor ? "  › " : "    "}</T>
            {title}
          </Line>
        ))}
        {/* One row stays free: a frame as tall as the window is not redrawn in place. */}
        <LedgerView state={state} full={full} now={now} height={rows - 1 - choices.length} />
      </Box>
    </Styled>
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

// Shows the Ledger until the scope closes, then erases it.
export const startLive = Effect.fn("startLive")(function* (store: LedgerStore, color: boolean) {
  const asking = cell<Asking | undefined>(undefined);
  const instance = render(<LiveLedger store={store} asking={asking} color={color} />, {
    exitOnCtrlC: false,
  });
  yield* Effect.addFinalizer(() =>
    Effect.promise(async () => {
      instance.clear();
      instance.unmount();
      await instance.waitUntilExit();
    }),
  );
  // Running items count up, and their spinners turn.
  yield* Effect.forkScoped(
    Effect.repeat(store.tick, Schedule.spaced(`${SPINNER.interval} millis`)),
  );
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
