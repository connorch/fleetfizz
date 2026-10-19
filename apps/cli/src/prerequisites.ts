// What `fizz init` checks on this Machine before it writes a config, and the
// command that fixes each problem. It only prints the fixes: they need sudo,
// a login, or a choice about the Tailscale app, which are the person's to
// make. A required problem stops `init`; an optional one does not.
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { runLocal } from "./local.ts";

export interface Facts {
  readonly platform: string;
  // `vp --version`, or undefined without vp.
  readonly vp: string | undefined;
  // undefined without the tailscale CLI.
  readonly tailscale:
    | {
        // The macOS app (from the App Store or tailscale.com), which cannot
        // accept Tailscale SSH, unlike Homebrew's tailscaled.
        readonly app: boolean;
        // `BackendState` from `tailscale status --json`: "Running" once logged in.
        readonly state: string | undefined;
        // `RunSSH` from `tailscale debug prefs`.
        readonly ssh: boolean;
      }
    | undefined;
  readonly brew: boolean;
  readonly gh: "missing" | "logged out" | "logged in";
}

export interface Check {
  readonly ok: boolean;
  // A failed required check stops `init`; an optional one is a warning.
  readonly required: boolean;
  readonly text: string;
  readonly fix?: string;
}

const SERVICE_MACOS =
  "brew install --formula tailscale && sudo brew services start tailscale && sudo tailscale up && sudo tailscale set --ssh";

// Each check, in the order `init` prints them.
export const checksOf = (facts: Facts): ReadonlyArray<Check> => {
  const darwin = facts.platform === "darwin";
  const vp: Check =
    facts.vp === undefined
      ? {
          ok: false,
          required: true,
          text: "vp is not installed",
          fix: "curl -fsSL https://vite.plus | bash",
        }
      : { ok: true, required: true, text: `vp ${facts.vp}` };
  const ts = facts.tailscale;
  const tailscale: ReadonlyArray<Check> =
    ts === undefined
      ? [
          {
            ok: false,
            required: true,
            text: "Tailscale is not installed",
            fix: darwin
              ? SERVICE_MACOS
              : "curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up && sudo tailscale set --ssh",
          },
        ]
      : ts.app && !ts.ssh
        ? [
            {
              ok: false,
              required: true,
              text: "Tailscale is the macOS app, which cannot accept Tailscale SSH. Quit and remove it, then use Homebrew's tailscaled",
              fix: SERVICE_MACOS,
            },
          ]
        : ts.state !== "Running"
          ? [
              {
                ok: false,
                required: true,
                text: `Tailscale is not connected (${ts.state ?? "unknown"})`,
                fix: "sudo tailscale up",
              },
            ]
          : [
              { ok: true, required: true, text: "Tailscale, connected" },
              ts.ssh
                ? { ok: true, required: true, text: "Tailscale SSH is on" }
                : {
                    ok: false,
                    required: true,
                    text: "Tailscale SSH is off",
                    fix: "sudo tailscale set --ssh",
                  },
            ];
  // The Mac's Tailscale fix installs tailscaled with Homebrew.
  const brewForTailscale = darwin && (ts === undefined || (ts.app && !ts.ssh));
  const brew: ReadonlyArray<Check> = !darwin
    ? []
    : facts.brew
      ? [{ ok: true, required: false, text: "Homebrew" }]
      : [
          {
            ok: false,
            required: brewForTailscale,
            text: brewForTailscale
              ? "Homebrew is not installed (Tailscale's fix needs it)"
              : "Homebrew is not installed (only brew and cask Items need it)",
            fix: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
          },
        ];
  const gh: Check =
    facts.gh === "logged in"
      ? { ok: true, required: false, text: "gh, logged in" }
      : {
          ok: false,
          required: false,
          text: `gh is ${facts.gh === "missing" ? "not installed" : "not logged in"} (only private Tracked Repos need it)`,
          fix:
            facts.gh === "logged out"
              ? "gh auth login"
              : darwin
                ? "brew install gh && gh auth login"
                : "install gh from https://cli.github.com, then gh auth login",
        };
  // Homebrew first: on a Mac, Tailscale is installed with it.
  return [vp, ...brew, ...tailscale, gh];
};

const Status = Schema.fromJsonString(
  Schema.Struct({ BackendState: Schema.optionalKey(Schema.String) }),
);
const Prefs = Schema.fromJsonString(Schema.Struct({ RunSSH: Schema.optionalKey(Schema.Boolean) }));

// Reads the Facts from this Machine.
export const readFacts = Effect.fn("readFacts")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const vp = yield* runLocal("vp", ["--version"]);
  const version = /^vp v?(\S+)/m.exec(vp.stdout)?.[1];
  const status = yield* runLocal("tailscale", ["status", "--json"]);
  const prefs = yield* runLocal("tailscale", ["debug", "prefs"]);
  const state = Schema.decodeOption(Status)(status.stdout);
  const ssh = Schema.decodeOption(Prefs)(prefs.stdout);
  const brew = yield* runLocal("brew", ["--version"]);
  const gh = yield* runLocal("gh", ["auth", "status"]);
  return {
    platform: process.platform,
    vp: vp.code === 0 ? version : undefined,
    tailscale:
      status.code === 127
        ? undefined
        : {
            app: process.platform === "darwin" && (yield* fs.exists("/Applications/Tailscale.app")),
            state: state._tag === "Some" ? state.value.BackendState : undefined,
            ssh: ssh._tag === "Some" && ssh.value.RunSSH === true,
          },
    brew: brew.code === 0,
    gh: gh.code === 127 ? "missing" : gh.code === 0 ? "logged in" : "logged out",
  } satisfies Facts;
});
