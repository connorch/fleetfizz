// What the suite ships: the fixture Config for a Fleet, and the Shared File
// the Starting Machine holds. The Tracked Repo is this repo on GitHub, at
// `ref`, and the Skill is the one it publishes (skills/fleetfizz).
import type { FleetConfig } from "@fleetfizz/config";

import type { FleetMachine } from "./fleet.ts";

export const FIXTURE_ORIGIN = "connorch/fleetfizz";
export const SKILL = "fleetfizz";

// The Shared File: a directory, so mirroring and mode bits are both covered.
export const SHARED_DIR = "~/.config/fleetfizz-e2e";
export const NOTES = "shipped from the Starting Machine";

// What the Tracked Repo's Install Command writes: its Output, the commit it
// installed.
export const OUTPUT = "~/.local/share/fleetfizz-e2e/installed";

// Writes the Shared File on the Starting Machine.
export const writeShared = [
  `mkdir -p ${SHARED_DIR}`,
  `printf '%s\\n' '${NOTES}' > ${SHARED_DIR}/notes.txt`,
  `printf '#!/bin/sh\\necho run\\n' > ${SHARED_DIR}/run.sh`,
  `chmod 755 ${SHARED_DIR}/run.sh`,
].join(" && ");

// The fixture Config, as written in config.jsonc. pnpm and the skills CLI are
// Globals of other package managers, as the README tells users. One Global is
// targeted at the first remote Machine only, and one has a Variant per
// Platform, so Targeting is checked on real Machines.
export const fixtureConfig = (
  machines: readonly [FleetMachine, FleetMachine, ...ReadonlyArray<FleetMachine>],
  version: string,
  ref: string,
): typeof FleetConfig.Encoded => ({
  version,
  machines: machines.map((m) => m.name),
  // pnpm 12, as in the README: from pnpm 11 its Globals live in PNPM_HOME/bin.
  npm: { items: { pnpm: "^12" } },
  pnpm: {
    dependsOn: ["npm"],
    items: {
      skills: "^1",
      semver: { range: "^7", machines: [machines[1].name] },
      "is-number": [
        { platforms: ["darwin"], range: "^6" },
        { platforms: ["linux"], range: "^7" },
      ],
    },
  },
  skills: {
    dependsOn: ["pnpm"],
    agents: ["claude-code"],
    items: { [SKILL]: { source: FIXTURE_ORIGIN, ref } },
  },
  repos: {
    items: {
      fixture: {
        origin: FIXTURE_ORIGIN,
        ref,
        install: `mkdir -p "$(dirname ${OUTPUT})" && git rev-parse HEAD > ${OUTPUT}`,
        outputs: [OUTPUT],
      },
    },
  },
  files: { items: { shared: SHARED_DIR } },
});
