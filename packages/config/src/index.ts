// @fleetfizz/config: the FleetConfig Schema and loading of config.jsonc.
export { addedRange, bumpConfig, bumpedRange, BumpError, bumpText } from "./bump.ts";
export {
  type EditResult,
  insertAt,
  type JsonPath,
  removeAt,
  saveConfig,
  targetingLists,
} from "./edit.ts";
export { fleetConfigJsonSchema, fleetConfigSchemaText } from "./jsonSchema.ts";
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
  isGlobalName,
  isPin,
  PACKAGE_MANAGERS,
  PROVIDER_NAMES,
  type PackageManager,
  Platform,
  ProviderName,
  Range,
  ReposSection,
  SELF_PACKAGE,
  SharedFile,
  Skill,
  SkillsSection,
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
