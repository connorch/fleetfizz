// @fleetfizz/config: the FleetConfig Schema and loading of config.jsonc.
export { bumpConfig, bumpedRange, BumpError, bumpText, rangePath } from "./bump.ts";
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
  DEFAULT_CLONE_ROOT,
  FleetConfig,
  isPin,
  MachineSettings,
  Platform,
  Range,
  repoName,
  SELF_PACKAGE,
  TrackedRepo,
  VpSection,
} from "./schema.ts";
export { stampText, staleCopies, type Copy, type Stamp } from "./stamp.ts";
