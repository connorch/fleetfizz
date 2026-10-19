// `fizz status`: where every Item stands on every Machine, now. It runs a dry
// run's Check and Plan (shipPass), so it agrees with what the next Ship would
// do, writes no Ship Log, and asks no Question: a Question shows as `?`. Then
// it draws `fizz config`'s sections with a column per Machine, and under
// them what differs on each Machine.
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Logger from "effect/Logger";
import { Box, Text } from "ink";

import { type ConfigRecord, configPath, type FleetConfig, loadConfig } from "@fleetfizz/config";
import { parseAddress } from "@fleetfizz/core";
import { CONFIG_STEP, readTailnet } from "@fleetfizz/remote";

import { readConfigRecord } from "./configRecord.ts";
import { ago, sectionsOf } from "./configView.tsx";
import type { Item, LedgerState, MachineEntry } from "./ledger.ts";
import { shipId } from "./log.ts";
import { shipPass } from "./ship.ts";
import { T, toText, type Tone } from "./view.tsx";

interface Cell {
  readonly glyph: string;
  readonly tone: Tone;
}

// One Item on one Machine: in line, changes, a Question, fails, skipped,
// not targeted there, or the Machine was not checked.
export const cellOf = (m: MachineEntry, address: string): Cell => {
  if (m.status === "skipped") return { glyph: "○", tone: "dim" };
  if (m.status === "failed") return { glyph: "✗", tone: "fail" };
  const item = m.items.find((i) => i.name === address);
  if (item === undefined) return { glyph: "·", tone: "dim" };
  if (item.status === "failed") return { glyph: "✗", tone: "fail" };
  if (item.asked === true) return { glyph: "?", tone: "ask" };
  if (item.status === "skipped") return { glyph: "–", tone: "skip" };
  return item.changes ? { glyph: "↑", tone: "run" } : { glyph: "✓", tone: "ok" };
};

// The Items to show, by Provider in `fizz config`'s order, each in the order
// the Machines list it; the config copy is shown per Machine instead.
export const rowsOf = (state: LedgerState, config: FleetConfig) => {
  const addresses = [...new Set(state.machines.flatMap((m) => m.items.map((i) => i.name)))].filter(
    (a) => a !== CONFIG_STEP,
  );
  return sectionsOf(config)
    .map((s) => s.provider)
    .flatMap((provider) => {
      const items = addresses.flatMap((a) => {
        const at = parseAddress(a);
        return at?.provider === provider ? [at.item] : [];
      });
      if (items.length === 0) return [];
      const section = sectionsOf(config).find((s) => s.provider === provider);
      return [
        {
          provider,
          items: items.map((name) => {
            // One value when every Variant wants the same.
            const wants = [
              ...new Set(section?.rows.filter((r) => r.name === name).map((r) => r.wants)),
            ];
            return {
              name,
              address: `${provider}:${name}`,
              wants: wants.length === 1 ? wants[0] : "",
            };
          }),
        },
      ];
    });
};

// What differs on one Machine: every Item that is not in line, and its config copy.
const differs = (m: MachineEntry): ReadonlyArray<Item> =>
  m.items.filter((i) => i.changes || i.status === "failed" || i.status === "skipped");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A Machine's one-line summary.
export const summaryOf = (
  m: MachineEntry,
  record: ConfigRecord | undefined,
  now: number,
): { readonly text: string; readonly tone: Tone } => {
  if (m.status === "skipped") {
    const at = record?.reached[m.name];
    return {
      text: `${m.detail ?? "skipped"} · ${at === undefined ? "never reached" : `last reached ${ago(now - Date.parse(at))}`}`,
      tone: "dim",
    };
  }
  if (m.status === "failed") return { text: `not checked: ${m.detail ?? "failed"}`, tone: "fail" };
  const items = differs(m);
  const counts = [
    [items.filter((i) => i.status === "failed").length, "failing"],
    [items.filter((i) => i.changes && i.status !== "failed").length, "to change"],
    [items.filter((i) => i.asked === true).length, "Question"],
    [items.filter((i) => i.status === "skipped" && i.asked !== true).length, "skipped"],
  ] as const;
  const parts = counts.flatMap(([n, what]) =>
    n === 0 ? [] : [what === "Question" ? plural(n, what) : `${n} ${what}`],
  );
  return parts.length === 0
    ? { text: "in line", tone: "ok" }
    : { text: parts.join(" · "), tone: counts[0][0] > 0 ? "fail" : "run" };
};

const value = (i: Item): string =>
  i.status === "failed" || i.status === "skipped"
    ? (i.detail ?? "")
    : i.from === undefined
      ? `+ ${i.to ?? ""}`
      : `${i.from} → ${i.to ?? ""}`;

export const statusText = (input: {
  readonly state: LedgerState;
  readonly config: FleetConfig;
  readonly record: ConfigRecord | undefined;
  readonly now: number;
}): string => {
  const { state } = input;
  const machines = state.machines;
  const checked = machines.filter((m) => m.status !== "skipped" && m.status !== "failed");
  const sections = rowsOf(state, input.config);
  const nameWidth = Math.max(...machines.map((m) => m.name.length)) + 2;
  const itemWidth = Math.max(0, ...sections.flatMap((s) => s.items.map((i) => i.name.length))) + 2;
  const wantsWidth =
    Math.min(
      32,
      Math.max(0, ...sections.flatMap((s) => s.items.map((i) => (i.wants ?? "").length))),
    ) + 2;
  const index = (n: number) => String(n + 1).padEnd(String(machines.length).length + 1);
  const anything = machines.some((m) => differs(m).length > 0);
  return toText(
    <Box flexDirection="column">
      <T tone="dim">{`Checked ${checked.length} of ${plural(machines.length, "Machine")} from ${state.from}`}</T>
      {state.notes
        .filter((n) => n.kind === "info")
        .map((n, i) => (
          <T key={i} tone="dim">
            {n.text}
          </T>
        ))}
      <Box flexDirection="column" marginTop={1}>
        {machines.map((m, i) => {
          const summary = summaryOf(m, input.record, input.now);
          return (
            <Text key={m.name}>
              <T tone="bold">{index(i)}</T>
              {m.name.padEnd(nameWidth)}
              <T tone={summary.tone}>{summary.text}</T>
            </Text>
          );
        })}
      </Box>
      {sections.map((s, n) => (
        <Box key={s.provider} flexDirection="column" marginTop={n === 0 ? 1 : 0}>
          <Text>
            <T tone="bold">{s.provider.padEnd(2 + itemWidth + wantsWidth)}</T>
            {n === 0 ? <T tone="bold">{machines.map((_, i) => i + 1).join(" ")}</T> : ""}
          </Text>
          {s.items.map((item) => (
            <Text key={item.name}>
              {`  ${item.name.padEnd(itemWidth)}`}
              {(item.wants ?? "").slice(0, 32).padEnd(wantsWidth)}
              {machines.map((m, i) => {
                const cell = cellOf(m, item.address);
                return (
                  <T key={m.name} tone={cell.tone}>
                    {`${cell.glyph}${i < machines.length - 1 ? " ".repeat(String(i + 2).length) : ""}`}
                  </T>
                );
              })}
            </Text>
          ))}
        </Box>
      ))}
      {machines.flatMap((m) => {
        const items = m.status === "skipped" || m.status === "failed" ? [] : differs(m);
        if (items.length === 0) return [];
        const width = Math.max(...items.map((i) => i.name.length)) + 2;
        return [
          <Box key={m.name} flexDirection="column" marginTop={1}>
            <T tone="bold">{m.name}</T>
            {items.map((i) => {
              const cell =
                i.name === CONFIG_STEP ? { glyph: "↑", tone: "run" as const } : cellOf(m, i.name);
              return (
                <Text key={i.name}>
                  {"  "}
                  <T tone={cell.tone}>{cell.glyph}</T>
                  {` ${i.name.padEnd(width)}${value(i)}`}
                  <T tone="dim">{i.reason === undefined ? "" : `  ${i.reason}`}</T>
                </Text>
              );
            })}
          </Box>,
        ];
      })}
      <Box marginTop={1}>
        <T tone="dim">
          {anything ? "fizz ship to bring them in line" : "Every Machine checked is in line."}
        </T>
      </Box>
    </Box>,
  );
};

export const status = Effect.fn("status")(function* (flags: {
  readonly config: string | undefined;
  readonly version: string;
}) {
  const tailnet = yield* readTailnet();
  const path = flags.config ?? configPath(process.env);
  const config = yield* loadConfig(path);
  const record = flags.config === undefined ? yield* readConfigRecord : undefined;
  const now = DateTime.now;
  const id = shipId(yield* now, tailnet.self.name);
  // Only at a terminal: a line that the result replaces.
  const tty = Boolean(process.stdout.isTTY);
  if (tty) process.stdout.write(`checking ${plural(config.machines.length, "Machine")}...`);
  let state: LedgerState | undefined;
  yield* shipPass(
    {
      dryRun: true,
      only: [],
      rebuild: [],
      answers: [],
      config: flags.config,
      version: flags.version,
    },
    tailnet,
    new Set(),
    id,
    (end) => {
      state = end;
    },
  ).pipe(
    Effect.scoped,
    // No Ship Log: nothing changes, and `fizz logs` lists Ships.
    Effect.provide(Logger.layer([])),
    Effect.ensuring(Effect.sync(() => tty && process.stdout.write("\r\x1b[2K"))),
  );
  if (state === undefined) return;
  yield* Console.log(
    statusText({ state, config, record, now: DateTime.toEpochMillis(yield* now) }),
  );
});
