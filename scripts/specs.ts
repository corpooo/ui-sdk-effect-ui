// Runs the upstream specs against our fixtures: overlays the fixtures, builds
// the upstream playground and serves it from this process, runs Playwright
// from the upstream checkout with our config, then stops the server and
// restores the checkout, whatever the run did. Arguments go to Playwright,
// like a spec file or `-g`. `--restore` only restores.
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { apply, planned, restore, unpinned, upstreamChanges } from "./overlay.ts";
import {
  playwrightConfig,
  port,
  report,
  results,
  upstreamBin,
  upstreamPlayground,
  upstreamTests,
  upstreamVite,
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

// Ctrl+C, a kill and a closed terminal stop whatever runs, so the run ends and cleans up below.
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    interrupted = true;
    for (const child of running) {
      stop(child, signal);
    }
  });
}

const errorsOnly: SpawnOptions["stdio"] = ["ignore", "ignore", "inherit"];

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
  // Resolves once this run's own server listens, and fails when it can't
  // bind, so the specs never run against whatever else holds the port. Its
  // own SIGTERM and stdin handlers exit before the links come out, so ours
  // are the only ones left.
  // Imported by path, as the Vite the playground builds with.
  const { preview } = (await import(upstreamVite)) as {
    preview: (config: object) => Promise<{ close: () => Promise<void> }>;
  };
  const term = process.listeners("SIGTERM");
  const end = process.stdin.listeners("end");
  const server = await preview({
    root: upstreamPlayground,
    logLevel: "error",
    preview: { port: Number(port), strictPort: true },
  }).catch((error: Error) => {
    console.error(
      `The playground can't serve on port ${port}: ${error.message}. Set PLAYGROUND_PORT.`,
    );
  });
  for (const listener of process.listeners("SIGTERM")) {
    if (!term.includes(listener)) {
      process.off("SIGTERM", listener);
    }
  }
  for (const listener of process.stdin.listeners("end")) {
    if (!end.includes(listener)) {
      process.stdin.off("end", listener);
    }
  }
  if (!server) {
    return 1;
  }
  try {
    if (interrupted) {
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
    await server.close();
  }
}

// First, so an earlier run's report can't pass the coverage gate for a run that never started.
rmSync(report, { force: true });
// The specs, the playground and core all come from the pinned commit.
const moved = unpinned();
if (moved) {
  console.error(moved);
  process.exit(1);
}
mkdirSync(results, { recursive: true });
apply();
console.log(`Overlaid ${planned().length} fixture files.`);
const status = await run();
const clean = restored();
process.exit(status !== 0 ? status : clean ? 0 : 1);
