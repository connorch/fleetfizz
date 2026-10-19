// Node programs the skills Provider runs on a Machine with `node -e`. The
// skills CLI needs Node, so wherever it runs, these do too; Node parses the
// CLI's JSON, which shell cannot do reliably. Each prints `ff-state` lines.

// Where the skills CLI keeps its lock, as the CLI itself finds it.
const LOCK = `
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { homedir } = require("node:os");
const readLock = () => {
  const state = process.env.XDG_STATE_HOME;
  try {
    const lock = JSON.parse(readFileSync(state ? join(state, "skills", ".skill-lock.json") : join(homedir(), ".agents", ".skill-lock.json"), "utf8"));
    return lock.version >= 3 && lock.skills ? lock.skills : {};
  } catch {
    return {};
  }
};
const emit = (fact) => console.log("ff-state " + JSON.stringify({ provider: "skills", ...fact }));
`;

// The Check. argv[1] is JSON [names, agents]: the targeted skills and every
// agent they are for. Prints the CLI's error if it does not know one of the
// agents, then for each skill its folder, its lock entry, and, for a GitHub
// source, the git tree hash of the folder, which the lock's hash matches
// until someone edits it. `skills ls` finds each folder wherever the CLI put
// it; which agents a skill is installed for, it cannot say reliably (only
// for agents it detects), so the Install Record keeps that.
export const OBSERVE = `${LOCK}
const { execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const [names, agents] = JSON.parse(process.argv[1]);
const lock = readLock();
const paths = new Map();
const text = (value) => (typeof value === "string" && value !== "" ? value : undefined);
try {
  const list = JSON.parse(execFileSync("skills", ["ls", "-g", "-a", ...agents, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  for (const s of list) if (names.includes(s.name) && !paths.has(s.name)) paths.set(s.name, s.path);
} catch (e) {
  // The CLI prints an unknown agent id on stdout: "Invalid agents: x".
  const error = String(e.stderr || e.stdout || e.message).replace(/\\u001b\\[[0-9;]*m/g, "").trim().split("\\n")[0];
  emit({ fact: "error", error: error || "skills ls failed" });
}
const treeHash = (dir) => {
  const git = mkdtempSync(join(tmpdir(), "fleetfizz-skill-"));
  try {
    execFileSync("git", ["init", "-q", "--bare", git]);
    const env = { ...process.env, GIT_DIR: git, GIT_INDEX_FILE: join(git, "index") };
    execFileSync("git", ["--work-tree", dir, "add", "-A", "-f", "."], { cwd: dir, env, stdio: "ignore" });
    return execFileSync("git", ["write-tree"], { env, encoding: "utf8" }).trim();
  } catch {
    return undefined;
  } finally {
    rmSync(git, { recursive: true, force: true });
  }
};
for (const name of names) {
  const entry = lock[name];
  const path = paths.get(name);
  const github = entry?.sourceType === "github" && text(entry.skillFolderHash) !== undefined;
  emit({
    fact: "skill",
    name,
    path,
    hash: path !== undefined && github ? treeHash(path) : undefined,
    lock: entry === undefined ? undefined : {
      source: String(entry.source),
      sourceType: String(entry.sourceType),
      ref: text(entry.ref),
      skillPath: text(entry.skillPath),
      hash: text(entry.skillFolderHash),
    },
  });
}
`;

// After an install. argv[1] is JSON names: prints the hash each one reached,
// from the lock the CLI just wrote, as core's AtFact.
export const REPORT = `${LOCK}
const lock = readLock();
for (const item of JSON.parse(process.argv[1])) {
  const hash = lock[item]?.skillFolderHash;
  if (typeof hash === "string" && hash !== "") emit({ fact: "at", item, at: hash.slice(0, 7) });
}
`;
