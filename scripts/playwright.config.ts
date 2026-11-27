// The upstream Playwright suite with our projects in place of its own, and
// our own specs beside it. It lives here and reads the upstream config by
// path, so no file is added to the upstream checkout for it. Playwright runs
// it from `upstream/ui/tests`.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  frameworks,
  ownFixtures,
  ownProjects,
  ownSpecs,
  report,
  results,
  upstreamSpecs,
  upstreamTests,
} from "./paths.ts";

// Imported by path at run time, so our type check doesn't hold upstream's files to our compiler options.
const { default: base } = (await import(`${upstreamTests}playwright.config.ts`)) as {
  default: object;
};
const { specsThatSkip } = (await import(`${upstreamTests}fixture-files.ts`)) as {
  specsThatSkip: (framework: string) => string[];
};

// For the coverage gate: the spec files that open a fixture we ship, by
// project. Upstream's rule decides, asked twice: a framework with no fixtures
// skips every spec file that opens one, and ours skips the ones it can't serve.
const expected = Object.fromEntries(
  frameworks.map((framework) => {
    const skipped = new Set(specsThatSkip(framework));
    const withNoFixtures = framework.replace("effect", "none");
    return [framework, specsThatSkip(withNoFixtures).filter((file) => !skipped.has(file))];
  }),
);

// Our own spec files, by the project that runs them. Every fixture of ours
// has an `effect.ts`, so `own` runs every file, and a fixture that's missing
// skips its tests, which the coverage gate fails. `own-ssr` runs the files
// that open a fixture with an `effect-ssr.ts`, by name, as upstream's specs do.
const ownFiles = readdirSync(ownSpecs).filter((file) => file.endsWith(".spec.ts"));
const opened = (file: string) =>
  [...readFileSync(join(ownSpecs, file), "utf8").matchAll(/\bopen\(\s*"own-([\w-]+)"/g)].map(
    ([, name]) => name!,
  );
const hasOwnFixture = (name: string, framework: string) =>
  ["ts", "tsx"].some((extension) =>
    existsSync(join(ownFixtures, name, `${framework}.${extension}`)),
  );
const own = Object.fromEntries(
  Object.entries(ownProjects).map(([project, framework]) => [
    project,
    framework.endsWith("-ssr")
      ? ownFiles.filter((file) => opened(file).some((name) => hasOwnFixture(name, framework)))
      : ownFiles,
  ]),
);

export default {
  ...base,
  testDir: upstreamSpecs,
  outputDir: results,
  metadata: { expected, own, args: process.env.SPECS_ARGS ?? "" },
  reporter: [[process.env.CI ? "dot" : "list"], ["json", { outputFile: report }]],
  projects: [
    // Specs that would only skip stay out of a project, as upstream's do.
    ...frameworks.map((framework) => ({
      name: framework,
      use: { browserName: "chromium" as const, framework },
      testIgnore: specsThatSkip(framework),
    })),
    ...Object.entries(ownProjects).map(([project, framework]) => ({
      name: project,
      testDir: ownSpecs,
      testMatch: own[project]!,
      use: { browserName: "chromium" as const, framework },
    })),
  ],
  // `specs.ts` builds and serves the playground, so it can stop the server on every way out.
  webServer: undefined,
};
