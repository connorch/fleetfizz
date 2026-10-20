// `fizz config`: the config as each Provider's section, the Items in it, and
// the Targeting written on each. Instant: it reads the config, the tailnet
// for each Machine's Platform, and the Config's Install Record for when a
// Ship last reached each Machine. Also the changed lines `fizz config add`
// and `remove` print.
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { Box, Text } from "ink";
import type { ReactNode } from "react";

import {
  type ConfigRecord,
  configPath,
  type FleetConfig,
  isPin,
  loadConfig,
  PACKAGE_MANAGERS,
  type SectionName,
  shaOf,
} from "@fleetfizz/config";
import type { Targeting } from "@fleetfizz/core";
import { readTailnet, type Tailnet } from "@fleetfizz/remote";

import { readConfigRecord } from "./configRecord.ts";
import { homeRelative } from "./local.ts";
import { T, toText } from "./view.tsx";

export interface Row {
  readonly name: string;
  // The Variant's index, when the Item is a list of Variants.
  readonly variant?: number;
  readonly wants: string;
  // The Targeting written on it, or undefined for every Machine its section targets.
  readonly where?: string;
}

export interface SectionView {
  readonly provider: SectionName;
  readonly where?: string;
  readonly rows: ReadonlyArray<Row>;
}

// The order sections are shown in: Globals, Homebrew, skills, repos, files.
export const SHOWN = [
  ...PACKAGE_MANAGERS,
  "brew",
  "cask",
  "skills",
  "repos",
  "files",
] as const satisfies ReadonlyArray<SectionName>;

const whereOf = (targeting: Targeting): string | undefined => {
  const parts = [...(targeting.platforms ?? []), ...(targeting.machines ?? [])];
  return parts.length === 0 ? undefined : parts.join(", ");
};

// One row per Item, or one per Variant.
const rowsOf = <E extends Targeting>(
  items: Readonly<Record<string, E | ReadonlyArray<E>>> | undefined,
  wants: (entry: E) => string,
): Row[] =>
  Object.entries(items ?? {}).flatMap(([name, entry]): Row[] => {
    const one = (e: E, variant?: number): Row => {
      const where = whereOf(e);
      return {
        name,
        wants: wants(e),
        ...(variant === undefined ? {} : { variant }),
        ...(where === undefined ? {} : { where }),
      };
    };
    return Array.isArray(entry) ? entry.map((e, i) => one(e, i)) : [one(entry as E)];
  });

// Every section the config has, as `fizz config` shows it.
export const sectionsOf = (config: FleetConfig): ReadonlyArray<SectionView> =>
  SHOWN.flatMap((provider): SectionView[] => {
    const section = config[provider];
    if (section === undefined) return [];
    const where = whereOf(section);
    const rows: Row[] = (() => {
      switch (provider) {
        case "vp":
        case "npm":
        case "bun":
        case "pnpm":
          return rowsOf(config[provider]?.items, (g) => g.range);
        case "brew":
          return rowsOf(config.brew?.items, (f) => f.range);
        case "cask":
          return rowsOf(config.cask?.items, (c) => c.range);
        case "skills":
          return rowsOf(config.skills?.items, (s) =>
            s.ref === undefined ? s.source : `${s.source}#${s.ref}`,
          );
        case "repos":
          return rowsOf(config.repos?.items, (r) => (isPin(r.ref) ? r.ref.slice(0, 7) : r.ref));
        case "files":
          return rowsOf(config.files?.items, (f) => f.path);
      }
    })();
    return [{ provider, ...(where === undefined ? {} : { where }), rows }];
  });

// Long values keep their start and end: `~/Library/…/Code/User`.
const WANTS_WIDTH = 32;
const shorten = (text: string, width: number): string =>
  text.length <= width
    ? text
    : `${text.slice(0, Math.ceil((width - 1) / 2))}…${text.slice(text.length - Math.floor((width - 1) / 2))}`;

const pad = (text: string, width: number) => text.padEnd(width);

const Sections = (props: { sections: ReadonlyArray<SectionView> }) => {
  const rows = props.sections.flatMap((s) => s.rows);
  const variants = rows.some((r) => r.variant !== undefined);
  const nameWidth = Math.max(0, ...rows.map((r) => r.name.length)) + 2;
  const wantsWidth =
    Math.min(WANTS_WIDTH, Math.max(0, ...rows.map((r) => r.wants.length))) + (variants ? 2 : 0) + 2;
  return (
    <>
      {props.sections.map((s) => (
        <Box key={s.provider} flexDirection="column" marginTop={1}>
          <Text>
            <T tone="bold">{pad(s.provider, 2 + nameWidth + wantsWidth)}</T>
            <T tone="skip">{s.where ?? ""}</T>
          </Text>
          {s.rows.length === 0 ? (
            <Text>
              <T tone="dim">{"  no Items"}</T>
            </Text>
          ) : (
            s.rows.map((r, i) => {
              // A Variant after the first leaves the name blank.
              const repeated = r.variant !== undefined && r.variant > 0;
              const index = r.variant === undefined ? (variants ? "  " : "") : `${r.variant} `;
              return (
                <Text key={i}>
                  {`  ${pad(repeated ? "" : r.name, nameWidth)}`}
                  <T tone="ask">{index}</T>
                  {pad(shorten(r.wants, WANTS_WIDTH), wantsWidth - (variants ? 2 : 0))}
                  <T tone="skip">{r.where ?? ""}</T>
                </Text>
              );
            })
          )}
        </Box>
      ))}
    </>
  );
};

const Machines = (props: { config: FleetConfig; tailnet: Tailnet }) => {
  const width = Math.max(...props.config.machines.map((m) => m.length)) + 2;
  return (
    <Box flexDirection="column" marginTop={1}>
      {props.config.machines.map((name, i) => {
        const machine = props.tailnet.fleet.find((m) => m.name === name);
        return (
          <Text key={name}>
            <T tone="bold">{i === 0 ? "machines  " : "          "}</T>
            {pad(name, width)}
            {machine === undefined ? (
              <T tone="fail">not on the tailnet</T>
            ) : (
              <>
                {machine.platform}
                <T tone="dim">
                  {[
                    name === props.tailnet.self.name ? " this Machine" : "",
                    machine.online ? "" : " offline",
                  ].join("")}
                </T>
              </>
            )}
          </Text>
        );
      })}
    </Box>
  );
};

// "just now", "5m ago", "2h ago", "9d ago".
export const ago = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};

// When a Ship last reached each Machine, from this Machine's Config record:
// the Machines the last Ship reached, then each one it missed.
export const shippedLine = (
  record: ConfigRecord | undefined,
  machines: ReadonlyArray<string>,
  sha: string,
  now: number,
): string => {
  const times = machines.map((m) => {
    const at = record?.reached[m];
    return { m, at: at === undefined ? undefined : Date.parse(at) };
  });
  const last = Math.max(...times.flatMap((t) => (t.at === undefined ? [] : [t.at])));
  if (record === undefined || !Number.isFinite(last)) return "No Ship has reached it yet.";
  const missed = times.filter((t) => t.at !== last);
  const reached = machines.length - missed.length;
  const others = missed
    .map((t) => `${t.m} ${t.at === undefined ? "never" : ago(now - t.at)}`)
    .join(", ");
  return [
    `Last Ship ${ago(now - last)} reached ${reached} of ${machines.length} Machine${machines.length === 1 ? "" : "s"}${others === "" ? "" : `; ${others}`}.`,
    ...(record.sha === sha ? [] : ["Edited since."]),
  ].join(" ");
};

export const configText = (input: {
  readonly path: string;
  readonly config: FleetConfig;
  readonly tailnet: Tailnet;
  readonly footer: ReadonlyArray<string>;
}): string =>
  toText(
    <Box flexDirection="column">
      <T tone="dim">{`${homeRelative(input.path)} · fleetfizz ${input.config.version}`}</T>
      <Machines config={input.config} tailnet={input.tailnet} />
      <Sections sections={sectionsOf(input.config)} />
      <Box flexDirection="column" marginTop={1}>
        {input.footer.map((line, i) => (
          <T key={i} tone="dim">
            {line}
          </T>
        ))}
      </Box>
    </Box>,
  );

export const showConfig = Effect.fn("showConfig")(function* (flags: {
  readonly config: string | undefined;
}) {
  const path = flags.config ?? configPath(process.env);
  const fs = yield* FileSystem.FileSystem;
  const config = yield* loadConfig(path);
  const tailnet = yield* readTailnet();
  // A file named by --config has no record of its own.
  const record = flags.config === undefined ? yield* readConfigRecord : undefined;
  const sha = yield* shaOf(yield* fs.readFileString(path));
  const now = DateTime.toEpochMillis(yield* DateTime.now);
  yield* Console.log(
    configText({
      path,
      config,
      tailnet,
      footer: [
        shippedLine(record, config.machines, sha, now),
        "fizz status for where each Machine stands.",
      ],
    }),
  );
});

// One line of an edit's change: kept for context, removed, or added.
export interface Changed {
  readonly sign: " " | "-" | "+";
  readonly text: string;
}

// The lines an edit changed, with a few lines before them and one after.
// One edit changes one stretch of the file.
export const changedLines = (
  before: string,
  after: string,
  context = 3,
): ReadonlyArray<Changed> => {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  const line =
    (sign: Changed["sign"]) =>
    (text: string): Changed => ({ sign, text });
  return [
    ...a.slice(Math.max(0, start - context), start).map(line(" ")),
    ...a.slice(start, a.length - end).map(line("-")),
    ...b.slice(start, b.length - end).map(line("+")),
    ...b.slice(b.length - end, b.length - end + 1).map(line(" ")),
  ];
};

// The changed lines, then one line saying what changed.
export const changeText = (path: string, before: string, after: string, summary: ReactNode) =>
  toText(
    <Box flexDirection="column">
      <T tone="dim">{homeRelative(path)}</T>
      {changedLines(before, after).map((line, i) => (
        <T key={i} tone={line.sign === "+" ? "ok" : line.sign === "-" ? "fail" : "dim"}>
          {`${line.sign} ${line.text}`}
        </T>
      ))}
      <Text>{summary}</Text>
    </Box>,
  );
