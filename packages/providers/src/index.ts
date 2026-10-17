// @fleetfizz/providers: the built-in Providers (ADR 0010).
import type { AnyProvider } from "@fleetfizz/core";

import { brew, cask } from "./brew/index.ts";
import { repos } from "./repos/index.ts";
import { vp } from "./vp/index.ts";

export {
  brew,
  cask,
  type HomebrewChange,
  type HomebrewItem,
  type HomebrewObserved,
} from "./brew/index.ts";
export { repos, type RepoChange, type RepoItem, type ReposObserved } from "./repos/index.ts";
export { vp, type VpChange, type VpItem, type VpObserved } from "./vp/index.ts";

// Every Provider, in the order that breaks dependsOn ties (PROVIDER_NAMES).
export const PROVIDERS: ReadonlyArray<AnyProvider> = [vp, brew, cask, repos];
