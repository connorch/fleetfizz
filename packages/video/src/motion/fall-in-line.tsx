import { FIZZ, FONT } from "@fleetfizz/brand-assets";
import {
  Easing,
  interpolate,
  interpolateColors,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// The homepage graphic, four rounds of a Ship. Each round, one machine takes a
// change the others lack: a new version of a tool, and the next version of the
// config. The others drift out of line, behind. The shipping machine's light
// swells and a spark runs out along the floor each way, drawing a line, and
// each machine drops onto the line, caught up, as the spark passes under it.
// Then the next machine ships. The last frame leads into the first, so it
// loops.
//
// Drawn on a 960 x 240 stage and rendered at 2x. Colors are baked into the
// video, so there is one render per site theme.

const THEMES = ["dark", "light"] as const;
type Theme = (typeof THEMES)[number];

interface Palette {
  readonly ink: string;
  readonly muted: string;
  readonly fizz: string;
  readonly drift: string;
}

// Ink is the site's foreground at the line weights the drawing needs. The
// light theme's green is the logo's (--logo in packages/ui's globals.css),
// since lime washes out on white.
const PALETTE: Record<Theme, Palette> = {
  dark: {
    ink: "rgba(250, 250, 250, 0.82)",
    muted: "rgba(250, 250, 250, 0.45)",
    fizz: FIZZ,
    drift: "#E8B33C",
  },
  light: {
    ink: "rgba(18, 18, 18, 0.8)",
    muted: "rgba(18, 18, 18, 0.45)",
    fizz: "#5E9300",
    drift: "#C27A12",
  },
};

const WIDTH = 960;
const HEIGHT = 240;
const SCALE = 2;
const FPS = 30;

// The floor the machines stand on, and where the line ends on each side. The
// stage is cropped close: the highest drift and the ping's halo reach about
// 10px from the top, and the labels end about 14px from the bottom, so the
// page can space it like any other block.
const FLOOR = 154;
const LEFT = 50;
const RIGHT = 910;

type Kind = "laptop" | "studio" | "server" | "mini";
interface Machine {
  readonly name: string;
  readonly x: number;
  readonly kind: Kind;
  // The status light, relative to the machine's base.
  readonly light: readonly [number, number];
  // Where it floats to when it falls behind.
  readonly drift: { readonly y: number; readonly rotate: number };
}

const MACHINES = [
  { name: "macbook-pro", x: 150, kind: "laptop", light: [46, -84], drift: { y: -26, rotate: -5 } },
  { name: "mac-studio", x: 380, kind: "studio", light: [40, -16], drift: { y: -18, rotate: 6 } },
  { name: "homelab", x: 600, kind: "server", light: [30, -97], drift: { y: -12, rotate: 5 } },
  { name: "mac-mini", x: 820, kind: "mini", light: [44, -15], drift: { y: -14, rotate: -7 } },
] as const satisfies ReadonlyArray<Machine>;

interface Round {
  readonly from: (typeof MACHINES)[number]["name"];
  readonly tool: string;
  readonly before: string;
  readonly after: string;
}

// Who ships each round, and the tool it brings everyone up to. The config's
// version climbs one step a round: round i takes it from v(i+1) to v(i+2).
const ROUNDS: ReadonlyArray<Round> = [
  { from: "mac-studio", tool: "node", before: "22.11.0", after: "24.18.1" },
  { from: "macbook-pro", tool: "t3code", before: "v0.3.2", after: "v0.3.3" },
  { from: "mac-mini", tool: "wrangler", before: "4.136.3", after: "4.141.0" },
  { from: "homelab", tool: "vp", before: "1.0.0", after: "1.1.0" },
];

// A round's timeline, in seconds. At CHANGE the shipping machine takes its
// change and the others fall behind, drifted out of line by DRIFTED. The spark
// leaves at PING at SPEED px/s; everything that lands is keyed to when it
// passes. The last round's line fades out over LINE_FADE. Labels swap in SWAP
// seconds, the old one gone before the new one shows, since two strings
// fading over each other read as noise.
const ROUND = 4.5;
const CHANGE = 0.2;
const DRIFTED = 0.9;
const PING = 1.4;
const SPEED = 440;
const LINE_FADE = 0.6;
const SWAP = 0.16;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// What a machine's two label rows say, and whether it is in step.
type Rows = readonly [string, string];
interface Label {
  readonly rows: Rows;
  readonly synced: boolean;
}
const result = (round: Round, i: number): Label => ({
  rows: [`${round.tool} ${round.after}`, `config v${i + 2}`],
  synced: true,
});
const behind = (round: Round, i: number): Label => ({
  rows: [`${round.tool} ${round.before}`, `config v${i + 1}`],
  synced: false,
});

function FallInLine({ theme }: { theme: Theme }) {
  const { fps } = useVideoConfig();
  return (
    <>
      {ROUNDS.map((round, i, all) => (
        <Sequence
          key={round.from}
          from={i * ROUND * fps}
          durationInFrames={ROUND * fps}
          layout="none"
        >
          {/* A round opens on what the one before it left, the first on the last's. */}
          <Ship
            round={round}
            i={i}
            start={result(all.at(i - 1) ?? round, (i || all.length) - 1)}
            c={PALETTE[theme]}
          />
        </Sequence>
      ))}
    </>
  );
}

// How far a machine that falls behind is from the line: 1 drifted, 0 in line.
// It eases out, then a little further while it waits, and springs onto the
// line when the spark passes.
function offLine(t: number, at: number, fps: number) {
  if (t < DRIFTED) {
    return interpolate(t, [0, DRIFTED], [0, 1], { easing: Easing.inOut(Easing.cubic) });
  }
  if (t < at) return interpolate(t, [DRIFTED, at], [1, 1.12], { easing: Easing.inOut(Easing.sin) });
  const landed = spring({ frame: (t - at) * fps, fps, config: { damping: 10, stiffness: 160 } });
  return 1.12 * (1 - landed);
}

// One round: `start` is every machine's label going in.
function Ship({ round, i, start, c }: { round: Round; i: number; start: Label; c: Palette }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const origin = MACHINES.find((m) => m.name === round.from) ?? MACHINES[0];
  const [lx, ly] = origin.light;
  const flash = interpolate(t, [PING - 0.24, PING, PING + 0.4], [1, 2.2, 1], clamp);
  const halo = interpolate(t, [PING - 0.12, PING, PING + 0.56], [0, 0.6, 1], clamp);
  const haloOpacity = interpolate(t, [PING - 0.12, PING, PING + 0.56], [0, 0.9, 0], clamp);
  const color = (label: Label) => (label.synced ? c.fizz : c.drift);
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%" fontFamily={FONT}>
      <defs>
        <radialGradient id="halo">
          <stop offset="0" stopColor={c.fizz} stopOpacity={0.55} />
          <stop offset="1" stopColor={c.fizz} stopOpacity={0} />
        </radialGradient>
        <filter id="glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <line
        x1={LEFT}
        y1={FLOOR + 1}
        x2={RIGHT}
        y2={FLOOR + 1}
        stroke={c.fizz}
        strokeWidth={2}
        opacity={interpolate(t, [0, LINE_FADE], [0.75, 0], clamp)}
      />
      <circle
        cx={origin.x + lx}
        cy={FLOOR + ly}
        r={46 * halo}
        fill="url(#halo)"
        opacity={haloOpacity}
      />
      {[LEFT, RIGHT].map((end) => (
        <Side key={end} origin={origin.x} end={end} t={t} fizz={c.fizz} />
      ))}
      {MACHINES.map((m) => {
        const ships = m === origin;
        const arrival = PING + Math.abs(m.x - origin.x) / SPEED;
        const off = ships ? 0 : offLine(t, arrival, fps);
        // The label it is swapping from and to, and when that swap starts.
        const [from, to, at] = ships
          ? [start, result(round, i), CHANGE]
          : t < arrival + 0.08
            ? [start, behind(round, i), CHANGE]
            : [behind(round, i), result(round, i), arrival + 0.08];
        const swap = interpolate(t, [at, at + SWAP], [0, 1], clamp);
        const [dx, dy] = m.light;
        return (
          <g key={m.name} transform={`translate(${m.x} ${FLOOR})`}>
            <g transform={`translate(0 ${m.drift.y * off}) rotate(${m.drift.rotate * off})`}>
              <Body kind={m.kind} c={c} />
              <circle
                cx={dx}
                cy={dy}
                r={ships ? 4 * flash : 4}
                fill={interpolateColors(swap, [0, 1], [color(from), color(to)])}
              />
            </g>
            <Caption c={c} name={m.name} />
            {([0, 1] as const).map((row) => (
              <Swap
                key={row}
                y={51 + row * 17}
                from={from.rows[row]}
                to={to.rows[row]}
                colors={[color(from), color(to)]}
                swap={swap}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// One side of the floor: the line drawn out from the shipping machine, and the
// spark at its tip, a bright head with a tail that fades out behind it.
function Side({ origin, end, t, fizz }: { origin: number; end: number; t: number; fizz: string }) {
  const length = Math.abs(end - origin);
  const run = Math.min(Math.max(SPEED * (t - PING), 0), length);
  const dir = Math.sign(end - origin);
  const tip = origin + dir * run;
  const tail = origin + dir * Math.max(run - 44, 0);
  // The spark fades in as it leaves and out as it reaches the line's end.
  const spark =
    run > 0 && run < length
      ? Math.min(
          interpolate(run, [0, 8], [0, 1], clamp),
          interpolate(run, [length - 30, length], [1, 0], clamp),
        )
      : 0;
  const gradient = `tail-${end}`;
  return (
    <g>
      <line
        x1={origin}
        y1={FLOOR + 1}
        x2={tip}
        y2={FLOOR + 1}
        stroke={fizz}
        strokeWidth={2}
        opacity={0.75}
      />
      {spark > 0 ? (
        <g opacity={spark}>
          <linearGradient
            id={gradient}
            gradientUnits="userSpaceOnUse"
            x1={tail}
            y1={0}
            x2={tip}
            y2={0}
          >
            <stop offset="0" stopColor={fizz} stopOpacity={0} />
            <stop offset="1" stopColor={fizz} stopOpacity={0.9} />
          </linearGradient>
          <line
            x1={tail}
            y1={FLOOR + 1}
            x2={tip}
            y2={FLOOR + 1}
            stroke={`url(#${gradient})`}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <circle cx={tip} cy={FLOOR + 1} r={7} fill={fizz} opacity={0.6} filter="url(#glow)" />
          <circle cx={tip} cy={FLOOR + 1} r={3.2} fill={fizz} />
        </g>
      ) : null}
    </g>
  );
}

function Caption({ c, name }: { c: Palette; name: string }) {
  return (
    <text x={0} y={30} fontSize={14} textAnchor="middle" fill={c.ink}>
      {name}
    </text>
  );
}

// A label row under a machine's name, swapping from one string to another as
// `swap` goes 0 to 1. A new string slides the old one up and out and rises
// into place; the same string just changes color.
function Swap({
  y,
  from,
  to,
  colors,
  swap,
}: {
  y: number;
  from: string;
  to: string;
  colors: readonly [string, string];
  swap: number;
}) {
  const text = { x: 0, fontSize: 12.5, textAnchor: "middle" } as const;
  if (from === to) {
    return (
      <text {...text} y={y} fill={interpolateColors(swap, [0, 1], colors)}>
        {to}
      </text>
    );
  }
  return (
    <>
      <text {...text} y={y - 6 * swap} fill={colors[0]} opacity={Math.max(0, 1 - 2 * swap)}>
        {from}
      </text>
      <text {...text} y={y + 6 * (1 - swap)} fill={colors[1]} opacity={Math.max(0, 2 * swap - 1)}>
        {to}
      </text>
    </>
  );
}

// Each machine as a monoline drawing standing on y = 0, centered on x = 0.
function Body({ kind, c }: { kind: Kind; c: Palette }) {
  const line = {
    fill: "none",
    stroke: c.ink,
    strokeWidth: 2.4,
    strokeLinejoin: "round",
    strokeLinecap: "round",
  } as const;
  const soft = { ...line, stroke: c.muted, strokeWidth: 2 };
  switch (kind) {
    case "laptop":
      return (
        <g>
          <rect {...line} x={-62} y={-98} width={124} height={82} rx={7} />
          <rect {...soft} strokeWidth={1.6} x={-54} y={-90} width={108} height={66} rx={3} />
          <path {...line} d="M-78 -12 H78 L70 0 H-70 Z" />
          <path {...soft} d="M-40 -74 h26 M-40 -62 h44 M-40 -50 h18" />
        </g>
      );
    case "studio":
      return (
        <g>
          <rect {...line} x={-56} y={-60} width={112} height={60} rx={13} />
          <path {...soft} d="M-44 -48 H44" />
          <rect {...line} x={-40} y={-26} width={5} height={13} rx={2.5} />
          <rect {...line} x={-29} y={-26} width={5} height={13} rx={2.5} />
          <path {...line} d="M-14 -19.5 h16" />
        </g>
      );
    case "server":
      return (
        <g>
          <rect {...line} x={-52} y={-124} width={104} height={124} rx={6} />
          {[-114, -76, -38].map((y) => (
            <g key={y}>
              <rect {...line} x={-44} y={y} width={88} height={30} rx={3} />
              <path {...soft} d={`M-34 ${y + 11} h28 M-34 ${y + 19} h20`} />
            </g>
          ))}
          <circle cx={30} cy={-61} r={3} fill={c.muted} />
          <circle cx={30} cy={-23} r={3} fill={c.muted} />
        </g>
      );
    case "mini":
      return (
        <g>
          <rect {...line} x={-58} y={-30} width={116} height={30} rx={8} />
          <path {...soft} d="M-46 -15 h22" />
        </g>
      );
  }
}

export const fallInLine = THEMES.map((theme) => ({
  id: `fall-in-line-${theme}`,
  component: FallInLine,
  defaultProps: { theme },
  durationInFrames: ROUNDS.length * ROUND * FPS,
  fps: FPS,
  width: WIDTH * SCALE,
  height: HEIGHT * SCALE,
}));
