// Runs the upstream specs against our fixtures: overlays the fixtures, runs
// Playwright from the upstream checkout with our config, and restores the
// checkout whatever the run did. Arguments go to Playwright, like a spec file
// or `-g`. `--restore` only restores.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { apply, planned, restore, upstreamChanges } from "./overlay.ts";
import { playwrightConfig, report, results, upstreamBin, upstreamTests } from "./paths.ts";

function restored() {
  restore();
  const changes = upstreamChanges();
  if (changes) {
    console.error(`The upstream checkout isn't as pinned:\n${changes}`);
    return false;
  }
  return true;
}

const args = process.argv.slice(2);
if (args.includes("--restore")) {
  process.exit(restored() ? 0 : 1);
}

apply();
console.log(`Overlaid ${planned().length} fixture files.`);
// An earlier run's report would pass the coverage gate for a run that never started.
rmSync(report, { force: true });
mkdirSync(results, { recursive: true });

// The binary runs directly: `pnpm exec` there would first switch to upstream's pnpm.
const playwright = spawn(
  `${upstreamBin}playwright`,
  ["test", "--config", playwrightConfig, ...args],
  { cwd: upstreamTests, stdio: "inherit" },
);
// Ctrl+C reaches Playwright too, which stops its server and exits, so the restore below still runs.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => playwright.kill(signal));
}
playwright.on("close", (code) => {
  const clean = restored();
  process.exit(code || (clean ? 0 : 1));
});
