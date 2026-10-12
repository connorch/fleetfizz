---
status: amended by ADR-0009 (Questions are asked in Ink, not with Prompt)
---

# Effect 4 instead of commander, zod, and clack

All fleetfizz TypeScript is written with Effect 4: `effect/Schema` for the config, checked state, and protocol lines; Effect's `cli` module for argument parsing; its `Prompt` for Questions; its `process` module for child processes; and Context services, Layers, and tagged errors throughout. Connor first picked commander, zod, and @clack/prompts, then chose the Effect equivalents, because using both sets means two schema systems, two error models, and conversions at every edge. `semver` is the one exception, since Effect has no semver module. pingdotgg/t3code is the reference for the workspace layout and Effect patterns.

## Consequences

- Do not add commander, zod, or @clack/prompts, even for one small feature.
- The Effect language service runs with t3code's diagnostics (for example `globalConsole`, `nodeBuiltinImport`, `preferSchemaOverJson` as errors), so Node builtins and globals go through Effect platform services.
