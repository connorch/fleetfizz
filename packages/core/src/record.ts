// Install Records: per Machine and per Tracked Repo, what the last successful
// install was made from. Stored on each Machine; compared here.

export interface InstallRecord {
  readonly commit: string;
  // The Managed Clone path at install time.
  readonly path: string;
  readonly install: string;
  readonly files: Readonly<Record<string, string>>;
  // Output path -> fingerprint, as fingerprinted after the install.
  readonly outputs: Readonly<Record<string, string>>;
}

// The same facts, as they are now. An Output fingerprint is undefined when the
// path does not exist.
export interface InstallInputs {
  readonly commit: string;
  readonly path: string;
  readonly install: string;
  readonly files: Readonly<Record<string, string>>;
  readonly outputs: Readonly<Record<string, string | undefined>>;
}

export type InstallDecision =
  | { readonly run: true; readonly reason: string }
  | { readonly run: false };

const sameRecord = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([k, v]) => b[k] === v);

export const decideInstall = (
  record: InstallRecord | undefined,
  now: InstallInputs,
  rebuild: boolean,
): InstallDecision => {
  if (rebuild) return { run: true, reason: "--rebuild" };
  if (record === undefined) return { run: true, reason: "never installed" };
  if (record.commit !== now.commit)
    return { run: true, reason: `new commit ${now.commit.slice(0, 7)}` };
  if (record.path !== now.path) return { run: true, reason: "clone moved" };
  if (record.install !== now.install) return { run: true, reason: "install command changed" };
  if (!sameRecord(record.files, now.files)) return { run: true, reason: "files changed" };
  for (const [path, fingerprint] of Object.entries(now.outputs)) {
    // A missing Output is Drift even when it was never recorded (newly declared).
    if (fingerprint === undefined || record.outputs[path] !== fingerprint) {
      return { run: true, reason: `drift: ${path}` };
    }
  }
  return { run: false };
};
