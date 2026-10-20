// @fleetfizz/providers: the built-in Providers (ADR 0010).
import type { AnyProvider } from "@fleetfizz/core";

import { brew, cask } from "./brew/index.ts";
import { files } from "./files/index.ts";
import { fleetfizz } from "./fleetfizz/index.ts";
import { bun, npm, pnpm, vp } from "./globals/index.ts";
import { repos } from "./repos/index.ts";
import { skills } from "./skills/index.ts";

export {
  brew,
  cask,
  type HomebrewChange,
  type HomebrewItem,
  type HomebrewObserved,
} from "./brew/index.ts";
export {
  files,
  type FileChange,
  type FileItem,
  type FilesObserved,
  type FilesResolved,
} from "./files/index.ts";
export {
  fleetfizz,
  type FleetfizzChange,
  type FleetfizzObserved,
  type FleetfizzResolved,
  installerOf,
  ownInstaller,
} from "./fleetfizz/index.ts";
export {
  bun,
  type GlobalChange,
  type GlobalItem,
  type GlobalsObserved,
  installWith,
  MANAGERS,
  npm,
  pnpm,
  vp,
} from "./globals/index.ts";
export { repos, type RepoChange, type RepoItem, type ReposObserved } from "./repos/index.ts";
export {
  skills,
  type SkillChange,
  type SkillItem,
  type SkillsObserved,
  type SkillsResolved,
} from "./skills/index.ts";

// Every Provider, in the order that breaks dependsOn ties (PROVIDER_NAMES).
export const PROVIDERS: ReadonlyArray<AnyProvider> = [
  brew,
  cask,
  files,
  vp,
  npm,
  bun,
  pnpm,
  skills,
  repos,
  fleetfizz,
];
