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
  DEFAULT_CLONE_ROOT,
  FilesSection,
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
  SharedFile,
  Targeting,
  TrackedRepo,
  VpSection,
} from "./schema.ts";
export {
  type ConfigCopy,
  ConfigRecord,
  decodeConfigRecord,
  decodeConfigRecordJson,
  encodeConfigRecord,
  isNewer,
  mergeReached,
  type Reached,
  reachedAfter,
  shaOf,
  staleWhy,
} from "./record.ts";
