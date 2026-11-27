// Puts our fixtures where the upstream playground looks for them, as symlinks,
// and takes them out again. Nothing else in the upstream checkout changes, so
// it stays at its pinned commit with a clean `git status`.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fixtures, frameworks, ownFixtures, upstream, upstreamFixtures } from "./paths.ts";

type Link = { link: string; target: string };

const isEntry = (file: string) =>
  frameworks.some((framework) => file === `${framework}.ts` || file === `${framework}.tsx`);

// `own` holds our own fixtures, so it is no fixture of upstream's.
const directories = (root: string) =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !["node_modules", "own"].includes(entry.name))
        .map((entry) => entry.name)
    : [];

// Each entry of the fixtures in `root`, linked where the playground looks for `served(name)`.
const links = (root: string, served: (name: string) => string) =>
  directories(root).flatMap((name) =>
    readdirSync(join(root, name))
      .filter(isEntry)
      .map((file) => ({
        link: join(upstreamFixtures, served(name), file),
        target: join(root, name, file),
      })),
  );

/** Every fixture entry we have, with the upstream path the playground loads it from. */
export function planned(): Link[] {
  return [...links(fixtures, (name) => name), ...links(ownFixtures, (name) => `own-${name}`)];
}

/** The names of upstream's fixtures we have an `effect` entry for. Our own fixtures aren't among them. */
export function shipped() {
  return directories(fixtures).filter((name) =>
    ["ts", "tsx"].some((extension) => existsSync(join(fixtures, name, `effect.${extension}`))),
  );
}

/** Our own fixtures, by the name a spec opens them with. */
export function owned() {
  return directories(ownFixtures).map((name) => `own-${name}`);
}

// A symlink into our fixtures is ours whoever made it: this run, one that was
// interrupted, or one from before a fixture was renamed.
function ours(path: string) {
  if (!lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) {
    return false;
  }
  return resolve(dirname(path), readlinkSync(path)).startsWith(fixtures);
}

/** Removes every link an overlay left, and the directories only it made. */
export function restore() {
  for (const name of directories(upstreamFixtures)) {
    const directory = join(upstreamFixtures, name);
    for (const file of readdirSync(directory)) {
      if (ours(join(directory, file))) {
        rmSync(join(directory, file));
      }
    }
    if (readdirSync(directory).length === 0) {
      rmSync(directory, { recursive: true });
    }
  }
}

/** Links every fixture entry into the playground, over whatever an earlier run left. */
export function apply() {
  restore();
  // A fixture of our own is ours alone: upstream must have no fixture of its name, for any framework.
  for (const name of owned()) {
    if (existsSync(join(upstreamFixtures, name))) {
      throw new Error(
        `Upstream has a fixture named ${name}, so rename fixtures/own/${name.slice(4)}.`,
      );
    }
  }
  for (const { link, target } of planned()) {
    if (lstatSync(link, { throwIfNoEntry: false })) {
      throw new Error(`${link} exists upstream, so our fixture would replace it.`);
    }
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(target, link);
  }
}

/** What `git status` shows in the upstream checkout: empty when it is as pinned. */
export function upstreamChanges() {
  return execFileSync("git", ["-C", upstream, "status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
}
