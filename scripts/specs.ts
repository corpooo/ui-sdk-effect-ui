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

// First, so an earlier run's report can't pass the coverage gate for a run that never started.
rmSync(report, { force: true });
mkdirSync(results, { recursive: true });
apply();
console.log(`Overlaid ${planned().length} fixture files.`);

// The binary runs directly: `pnpm exec` there would first switch to upstream's pnpm.
const playwright = spawn(
  `${upstreamBin}playwright`,
  ["test", "--config", playwrightConfig, ...args],
  // The coverage gate takes only a run of everything, so the report says what narrowed this one.
  { cwd: upstreamTests, stdio: "inherit", env: { ...process.env, SPECS_ARGS: args.join(" ") } },
);
// Ctrl+C reaches Playwright too, which stops its server and exits, so the restore below still runs.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => playwright.kill(signal));
}
// `close` has no code when a signal ended Playwright, and `error` comes
// when it never started, like before `pnpm upstream`. Neither is a pass.
function finish(code: number | null) {
  const clean = restored();
  const status = code ?? 1;
  process.exit(status !== 0 ? status : clean ? 0 : 1);
}
playwright.on("error", (error) => {
  console.error(`Playwright didn't start: ${error.message}. Run \`pnpm upstream\` first.`);
  finish(1);
});
playwright.on("close", finish);
