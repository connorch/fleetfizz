import { describe, expect, it } from "@effect/vitest";

import { decideInstall, type InstallInputs, type InstallRecord } from "./record.ts";

const record: InstallRecord = {
  commit: "9e02bb1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  path: "/Volumes/StudioStack SSD/fleetfizz/clones/connorch-t3code",
  install: "pnpm install --frozen-lockfile",
  outputs: { "/Applications/T3 Code (Alpha).app": "sha256:abc" },
};
const same: InstallInputs = { ...record };

describe("decideInstall", () => {
  it("skips when everything matches", () => {
    expect(decideInstall(record, same, false)).toEqual({ run: false });
  });

  it("runs when there is no record", () => {
    expect(decideInstall(undefined, same, false)).toEqual({ run: true, reason: "never installed" });
  });

  it("runs on a new commit, a moved clone, or a changed command", () => {
    expect(
      decideInstall(record, { ...same, commit: "1234567bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }, false),
    ).toEqual({
      run: true,
      reason: "new commit 1234567",
    });
    expect(decideInstall(record, { ...same, path: "/elsewhere" }, false)).toEqual({
      run: true,
      reason: "clone moved",
    });
    expect(decideInstall(record, { ...same, install: "make" }, false)).toEqual({
      run: true,
      reason: "install command changed",
    });
  });

  it("runs on Drift: an Output fingerprint changed or the Output is gone", () => {
    expect(
      decideInstall(
        record,
        { ...same, outputs: { "/Applications/T3 Code (Alpha).app": "sha256:other" } },
        false,
      ),
    ).toEqual({ run: true, reason: "drift: /Applications/T3 Code (Alpha).app" });
    expect(
      decideInstall(
        record,
        { ...same, outputs: { "/Applications/T3 Code (Alpha).app": undefined } },
        false,
      ),
    ).toEqual({ run: true, reason: "drift: /Applications/T3 Code (Alpha).app" });
  });

  it("runs when a newly declared Output does not exist yet", () => {
    expect(
      decideInstall(
        record,
        { ...same, outputs: { ...same.outputs, "~/.local/bin/t3": undefined } },
        false,
      ),
    ).toEqual({ run: true, reason: "drift: ~/.local/bin/t3" });
  });

  it("--rebuild always runs", () => {
    expect(decideInstall(record, same, true)).toEqual({ run: true, reason: "--rebuild" });
  });
});
