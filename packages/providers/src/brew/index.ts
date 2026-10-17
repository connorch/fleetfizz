// The brew and cask Providers: Formulae and Casks, installed with Homebrew.
// Homebrew installs only a package's newest version, so a Range is "*"
// (install when missing) or "latest" (brew update, then upgrade every Ship).
// A Ship never installs Homebrew itself: the implicit `brew:brew` Item fails
// on a Machine without it.
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { HomebrewRange } from "@fleetfizz/config";
import { AtFact, type Decision, type Provider, type Step, type Targeted } from "@fleetfizz/core";
import { quote } from "@fleetfizz/remote";

// Homebrew itself, or a Formula or Cask kept inside its Range.
export type HomebrewItem = Targeted &
  ({ readonly kind: "homebrew" } | { readonly kind: "package"; readonly range: HomebrewRange });

export interface HomebrewObserved {
  // Homebrew's version, undefined when it is not installed.
  readonly brew?: string;
  // Installed versions by Item.
  readonly at: ReadonlyMap<string, string>;
}

export interface HomebrewChange {
  readonly kind: "install" | "upgrade";
  readonly name: string;
}

const HomebrewFact = Schema.Union([
  Schema.Struct({ fact: Schema.Literal("brew"), version: Schema.NullOr(Schema.String) }),
  AtFact,
]);
const decodeFact = Schema.decodeUnknownOption(HomebrewFact);

// Over ssh, linux login shells often skip the .bashrc line that puts
// Homebrew on PATH. Appended, so a brew already on PATH wins.
const BREW_PATH = `export PATH="$PATH:/opt/homebrew/bin:/home/linuxbrew/.linuxbrew/bin"`;

const NO_BREW = "Homebrew is not installed; install it first";

// One Homebrew Provider: `brew` for Formulae, `cask` for Casks.
const homebrew = <Name extends "brew" | "cask">(
  name: Name,
): Provider<Name, HomebrewItem, HomebrewObserved, void, HomebrewChange> => {
  const flag = name === "brew" ? "--formula" : "--cask";
  // Prints each named Item's installed version as an AtFact.
  const report = (names: ReadonlyArray<string>) =>
    `for ff_i in ${names.map(quote).join(" ")}; do ff_v=$(brew list --versions ${flag} "$ff_i" 2>/dev/null | awk '{print $NF}'); [ -z "$ff_v" ] || ff_at ${name} "$ff_i" "$ff_v"; done`;
  // One Step for a batch, then the versions it reached. The subshell exits
  // with the brew command's code, so the Step's result is that command's.
  const step = (what: "install" | "upgrade", names: ReadonlyArray<string>): Step => ({
    id: `${name}:${name === "brew" ? "formulae" : "casks"}:${what}`,
    items: names,
    doing: what === "install" ? "installing" : "upgrading",
    run: [
      [
        `( ${BREW_PATH}`,
        `${what === "upgrade" ? "brew update && " : ""}NONINTERACTIVE=1 brew ${what} ${flag} ${names.map(quote).join(" ")}`,
        "ff_rc=$?",
        report(names),
        "exit $ff_rc )",
      ].join("; "),
    ],
  });
  return {
    name,
    rule: "range",
    // Casks are installed with Homebrew, which the brew Provider checks.
    dependsOn: name === "cask" ? ["brew"] : [],
    items(section) {
      if (section === undefined) return [];
      const packages = Object.entries(section.items ?? {}).map(([item, entry]): HomebrewItem =>
        typeof entry === "string"
          ? { name: item, kind: "package", range: entry }
          : { ...entry, name: item, kind: "package" },
      );
      return name === "brew" ? [{ name: "brew", kind: "homebrew" }, ...packages] : packages;
    },
    observe: (items) =>
      [
        BREW_PATH,
        "if command -v brew >/dev/null 2>&1; then",
        `  ff_state "{\\"provider\\":\\"${name}\\",\\"fact\\":\\"brew\\",\\"version\\":\\"$(ff_json "$(brew --version 2>/dev/null | head -n 1 | sed 's/^Homebrew //')")\\"}"`,
        `  ${report(items.flatMap((i) => (i.kind === "package" ? [i.name] : [])))}`,
        "else",
        `  ff_state '{"provider":"${name}","fact":"brew","version":null}'`,
        "fi",
      ].join("\n"),
    parse(facts) {
      let brew: string | undefined;
      const at = new Map<string, string>();
      for (const raw of facts) {
        const fact = decodeFact(raw);
        if (fact._tag === "None") continue;
        const f = fact.value;
        if (f.fact === "brew") brew = f.version ?? undefined;
        else at.set(f.item, f.at);
      }
      return { ...(brew === undefined ? {} : { brew }), at };
    },
    resolve: () => Effect.void,
    decide({ items, observed, ctx }) {
      return items.map((item): Decision<HomebrewChange> => {
        const installed = observed.at.get(item.name);
        const at = installed === undefined ? {} : { at: installed };
        if (item.kind === "homebrew")
          return observed.brew === undefined
            ? { kind: "fail", item: item.name, reason: NO_BREW }
            : { kind: "leave", item: item.name, at: observed.brew };
        if (name === "cask" && ctx.machine.platform !== "darwin")
          return { kind: "fail", item: item.name, reason: "Casks need macOS" };
        if (observed.brew === undefined)
          // brew:brew already failed for this; a Cask has no such Item.
          return name === "brew"
            ? { kind: "skip", item: item.name, reason: "needs Homebrew" }
            : { kind: "fail", item: item.name, reason: NO_BREW };
        if (installed === undefined)
          return {
            kind: "change",
            item: item.name,
            to: "latest",
            change: { kind: "install", name: item.name },
          };
        // Whether "latest" is newer is only known after brew update, in Apply.
        if (item.range === "latest")
          return {
            kind: "change",
            item: item.name,
            from: installed,
            to: "latest",
            change: { kind: "upgrade", name: item.name },
          };
        return { kind: "leave", item: item.name, ...at };
      });
    },
    act(decisions) {
      const changes = decisions.flatMap((d) => (d.kind === "change" ? [d.change] : []));
      const names = (kind: HomebrewChange["kind"]) =>
        changes.flatMap((c) => (c.kind === kind ? [c.name] : []));
      return (["install", "upgrade"] as const).flatMap((what) => {
        const batch = names(what);
        return batch.length === 0 ? [] : [step(what, batch)];
      });
    },
  };
};

export const brew = homebrew("brew");
export const cask = homebrew("cask");
