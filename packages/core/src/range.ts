import * as semver from "semver";

// What a Ship does about one Global (or vp, or Node) given its Range, the
// installed version, and the versions the registry offers. See ADR 0006.
export type RangeDecision =
  | { readonly kind: "leave" }
  | { readonly kind: "install"; readonly version: string }
  // Above the Range: a Question for the Starting Machine.
  | { readonly kind: "ask"; readonly installed: string }
  // No published version satisfies the Range.
  | { readonly kind: "unavailable" };

const newest = (available: readonly string[]): string | undefined =>
  available.filter((v) => semver.prerelease(v) === null).sort(semver.rcompare)[0];

export const decideRange = (
  range: string,
  installed: string | undefined,
  available: readonly string[],
): RangeDecision => {
  if (range === "latest") {
    const version = newest(available);
    if (version === undefined) return { kind: "unavailable" };
    return installed === version ? { kind: "leave" } : { kind: "install", version };
  }
  if (range === "*") {
    if (installed !== undefined) return { kind: "leave" };
    const version = newest(available);
    return version === undefined ? { kind: "unavailable" } : { kind: "install", version };
  }
  if (installed !== undefined && semver.satisfies(installed, range)) return { kind: "leave" };
  if (installed !== undefined && semver.gtr(installed, range)) return { kind: "ask", installed };
  const version = semver.maxSatisfying([...available], range);
  return version === null ? { kind: "unavailable" } : { kind: "install", version };
};
