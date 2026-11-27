// Runs the upstream specs against our fixtures: overlays the fixtures, builds
// and serves the upstream playground, runs Playwright from the upstream
// checkout with our config, then stops the server and restores the checkout,
// whatever the run did. Arguments go to Playwright, like a spec file or `-g`.
// `--restore` only restores.
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { apply, planned, restore, upstreamChanges } from "./overlay.ts";
import {
  playwrightConfig,
  port,
  report,
  results,
  upstreamBin,
  upstreamPlayground,
  upstreamTests,
} from "./paths.ts";

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

// Upstream's binaries run directly: `pnpm` there would first switch to upstream's version.
const running = new Set<ChildProcess>();
/** Starts a command in a process group of its own, so stopping it stops what it started too. */
function start(command: string, args: string[], options: SpawnOptions) {
  const child = spawn(`${upstreamBin}${command}`, args, { ...options, detached: true });
  running.add(child);
  return child;
}
function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (running.has(child) && child.pid !== undefined) {
    process.kill(-child.pid, signal);
  }
}
/** Its exit code. A command a signal ended, or one that never started, didn't pass. */
const ended = (child: ChildProcess) =>
  new Promise<number>((resolve) => {
    const end = (code: number) => {
      running.delete(child);
      resolve(code);
    };
    child.on("error", (error) => {
      console.error(
        `${child.spawnfile} didn't start: ${error.message}. Run \`pnpm upstream\` first.`,
      );
      end(1);
    });
    child.on("close", (code) => end(code ?? 1));
  });

// Ctrl+C and a kill stop whatever runs, so the run ends and cleans up below.
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    interrupted = true;
    for (const child of running) {
      stop(child, signal);
    }
  });
}

const errorsOnly: SpawnOptions["stdio"] = ["ignore", "ignore", "inherit"];

/** Whether the playground answers before its server gives up. */
async function serving(server: Promise<number>) {
  let gone = false;
  void server.then(() => (gone = true));
  for (let waited = 0; waited < 60_000 && !gone; waited += 100) {
    const up = await fetch(`http://localhost:${port}`).then(
      (response) => response.ok,
      () => false,
    );
    if (up) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.error(
    `The playground isn't serving on port ${port}. If something else uses it, set PLAYGROUND_PORT.`,
  );
  return false;
}

async function run() {
  // A build, as upstream's CI serves: our fixtures are files outside the
  // playground, which its dev server refuses to serve. Only the client build:
  // the server builds render Vue, Svelte and Solid, which we don't run.
  const built = await ended(
    start("vite", ["build"], {
      cwd: upstreamPlayground,
      stdio: errorsOnly,
      env: { ...process.env, NODE_ENV: "development" },
    }),
  );
  if (built !== 0 || interrupted) {
    return built || 1;
  }
  const preview = start("vite", ["preview", "--port", port, "--strictPort"], {
    cwd: upstreamPlayground,
    stdio: errorsOnly,
  });
  const previewed = ended(preview);
  try {
    if (!(await serving(previewed))) {
      return 1;
    }
    return await ended(
      start("playwright", ["test", "--config", playwrightConfig, ...args], {
        cwd: upstreamTests,
        stdio: "inherit",
        // The coverage gate takes only a run of everything, so the report says what narrowed this one.
        env: { ...process.env, SPECS_ARGS: args.join(" ") },
      }),
    );
  } finally {
    stop(preview);
    await previewed;
  }
}

// First, so an earlier run's report can't pass the coverage gate for a run that never started.
rmSync(report, { force: true });
mkdirSync(results, { recursive: true });
apply();
console.log(`Overlaid ${planned().length} fixture files.`);
const status = await run();
const clean = restored();
process.exit(status !== 0 ? status : clean ? 0 : 1);
