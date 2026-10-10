// @fleetfizz/config: the FleetConfig Schema and loading of fleet.config.jsonc.
export { fleetConfigJsonSchema } from "./jsonSchema.ts";
export {
  CONFIG_FILE,
  ConfigError,
  ConfigNotFound,
  findConfig,
  loadConfig,
  parseConfig,
} from "./load.ts";
export {
  DEFAULT_CLONE_ROOT,
  FleetConfig,
  isPin,
  MachineSettings,
  Platform,
  Range,
  repoName,
  TrackedRepo,
  VpSection,
} from "./schema.ts";
