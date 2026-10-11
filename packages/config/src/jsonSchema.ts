import * as JsonSchema from "effect/JsonSchema";
import * as Schema from "effect/Schema";

import { FleetConfig } from "./schema.ts";

// The JSON Schema that editors validate config.jsonc against. Published
// as schema.json in the fleetfizz package; CI checks that file is current.
export const fleetConfigJsonSchema = () => {
  // Unknown keys are errors in the editor too, matching the decoder (load.ts).
  const document = Schema.toJsonSchemaDocument(FleetConfig, { onExcessProperty: "error" });
  return {
    $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
    title: "fleetfizz config",
    ...document.schema,
    $defs: document.definitions,
  };
};
