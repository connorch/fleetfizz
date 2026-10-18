// @fleetfizz/config: the FleetConfig Schema and loading of config.jsonc.
export { bumpConfig, bumpedRange, BumpError, bumpText } from "./bump.ts";
export { fleetConfigJsonSchema } from "./jsonSchema.ts";
export {
  CONFIG_FILE,
  configDir,
  ConfigError,
  ConfigNotFound,
  configPath,
  loadConfig,
  parseConfig,
  SCHEMA_FILE,
} from "./load.ts";
export {
  BrewSection,
  CaskSection,
  CloneRoot,
  DEFAULT_CLONE_ROOT,
  FleetConfig,
  HomebrewRange,
  isPin,
  PACKAGE_MANAGERS,
  type PackageManager,
  Platform,
  ProviderName,
  Range,
  ReposSection,
  SELF_PACKAGE,
  Targeting,
  TrackedRepo,
  VpSection,
} from "./schema.ts";
export { stampText, staleCopies, type Copy, type Stamp } from "./stamp.ts";
