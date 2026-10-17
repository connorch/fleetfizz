import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Renders motion graphics into renders/, two transparent files each, which the
// website imports as @fleetfizz/video/renders/<id>.<ext>:
//
// - <id>.webm, VP9 with alpha, for Chrome and Firefox.
// - <id>.mov, HEVC with alpha, for Safari, which ignores WebM's alpha.
//   Remotion cannot encode HEVC with alpha, so this is a ProRes 4444 render
//   that macOS's avconvert re-encodes. Renders run on a Mac.
//
// `pnpm render` renders every composition, `pnpm render <id>...` only those.
// Commit the output. Node runs the TypeScript as is.

const run = (command: string, args: string[]) => execFileSync(command, args, { stdio: "inherit" });

// --quiet prints only the ids, space separated.
const all = () =>
  execFileSync("remotion", ["compositions", "--quiet"], { encoding: "utf8" }).trim().split(/\s+/);
const ids = process.argv.length > 2 ? process.argv.slice(2) : all();

const scratch = mkdtempSync(join(tmpdir(), "fleetfizz-video-"));
try {
  for (const id of ids) {
    const render = (out: string, flags: string[]) =>
      run("remotion", ["render", id, out, "--image-format=png", ...flags]);
    render(`renders/${id}.webm`, ["--codec=vp9", "--pixel-format=yuva420p"]);
    const prores = join(scratch, `${id}.mov`);
    render(prores, ["--codec=prores", "--prores-profile=4444", "--pixel-format=yuva444p10le"]);
    run("avconvert", [
      "--source",
      prores,
      "--preset",
      "PresetHEVCHighestQualityWithAlpha",
      "--output",
      `renders/${id}.mov`,
      "--replace",
    ]);
    console.log(`Wrote packages/video/renders/${id}.webm and ${id}.mov`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
