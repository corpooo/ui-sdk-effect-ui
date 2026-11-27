// Prepares the upstream checkout for a type check and a spec run: its
// dependencies, core's declarations, and the browser the specs run in.
// Run it after a clone and after the submodule moves.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { upstream, upstreamBin, upstreamCore } from "./paths.ts";

if (!existsSync(`${upstream}package.json`)) {
  console.error("upstream/ui is empty. Run `git submodule update --init` first.");
  process.exit(1);
}

const run = (command: string, args: string[], cwd: string) =>
  execFileSync(command, args, { cwd, stdio: "inherit" });

// With the pnpm upstream pins, which its lockfile and policies were written for.
// Through npx, since our pnpm declines to switch to it.
const { packageManager } = JSON.parse(readFileSync(`${upstream}package.json`, "utf8")) as {
  packageManager: string;
};
run("npx", ["--yes", packageManager, "install", "--frozen-lockfile"], upstream);

// Our type check reads core through these, so it holds our code to our
// compiler options and not upstream's. See `paths` in tsconfig.json.
run("node", ["../../scripts/build/build-package.mjs"], upstreamCore);

run(
  `${upstreamBin}playwright`,
  ["install", ...(process.env.CI ? ["--with-deps"] : []), "chromium"],
  upstream,
);
