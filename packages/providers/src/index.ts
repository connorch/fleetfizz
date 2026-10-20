// @fleetfizz/providers: the built-in Providers (ADR 0010).
import type { AnyProvider } from "@fleetfizz/core";

import { brew, cask } from "./brew/index.ts";
import { files } from "./files/index.ts";
import { repos } from "./repos/index.ts";
import { skills } from "./skills/index.ts";
import { vp } from "./vp/index.ts";

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
export { repos, type RepoChange, type RepoItem, type ReposObserved } from "./repos/index.ts";
export {
  skills,
  type SkillChange,
  type SkillItem,
  type SkillsObserved,
  type SkillsResolved,
} from "./skills/index.ts";
export { vp, type VpChange, type VpItem, type VpObserved } from "./vp/index.ts";

// Every Provider, in the order that breaks dependsOn ties (PROVIDER_NAMES).
export const PROVIDERS: ReadonlyArray<AnyProvider> = [files, vp, brew, cask, skills, repos];
