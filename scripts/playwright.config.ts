// The upstream Playwright suite with our projects in place of its own, and
// our own specs beside it. It lives here and reads the upstream config by
// path, so no file is added to the upstream checkout for it. Playwright runs
// it from `upstream/ui/tests`.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { opens, ownShipped } from "./overlay.ts";
import {
  frameworks,
  ownProjects,
  ownSpecs,
  report,
  results,
  upstreamSpecs,
  upstreamTests,
  variedFramework,
} from "./paths.ts";

type Project = {
  name: string;
  use: { framework?: string; fixtureOptions?: Record<string, string> };
  testMatch?: string[];
  testIgnore?: string[];
};

// Imported by path at run time, so our type check doesn't hold upstream's files to our compiler options.
const { default: base } = (await import(`${upstreamTests}playwright.config.ts`)) as {
  default: { projects: Project[] };
};
const { specsThatSkip } = (await import(`${upstreamTests}fixture-files.ts`)) as {
  specsThatSkip: (framework: string) => string[];
};

// For the coverage gate: the spec files that open a fixture we ship, by
// project. Upstream's rule decides, asked twice: a framework with no fixtures
// skips every spec file that opens one, and ours skips the ones it can't serve.
const opening = (framework: string) => {
  const skipped = new Set(specsThatSkip(framework));
  const withNoFixtures = framework.replace("effect", "none");
  return specsThatSkip(withNoFixtures).filter((file) => !skipped.has(file));
};

// Whether a spec file matches one of upstream's patterns, like `**/menu.*spec.ts`.
const matches = (pattern: string, file: string) =>
  new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*\//g, "(.*/)?")
      .replace(/\*/g, "[^/]*")}$`,
  ).test(file);

// Every other way upstream runs React's fixtures, like with each popup in a
// portal container or presented as a sheet, run the same way for ours: the
// options, the spec files and what it leaves out are upstream's. What upstream
// leaves out for React by name, we leave out by our own fixtures.
const varied = base.projects
  .filter(({ name, use }) => use.framework === "react" && name !== "react")
  .map(({ name, use, testMatch = [], testIgnore = [] }) => {
    const ignored = testIgnore.filter((pattern) => pattern.includes("*"));
    return {
      name: name.replace("react", variedFramework),
      fixtureOptions: use.fixtureOptions ?? {},
      testMatch,
      testIgnore: [...ignored, ...specsThatSkip(variedFramework)],
      expected: opening(variedFramework).filter(
        (file) =>
          testMatch.some((pattern) => matches(pattern, file)) &&
          !ignored.some((pattern) => matches(pattern, file)),
      ),
    };
  });

const expected = {
  ...Object.fromEntries(frameworks.map((framework) => [framework, opening(framework)])),
  ...Object.fromEntries(varied.map((project) => [project.name, project.expected])),
};

// Our own spec files, by the project that runs them. Every fixture of ours
// has an `effect.ts`, so `own` runs every file, and a fixture that's missing
// skips its tests, which the coverage gate fails. `own-ssr` runs the files
// that open a fixture with an `effect-ssr.ts`, by name, as upstream's specs do.
const ownFiles = readdirSync(ownSpecs).filter((file) => file.endsWith(".spec.ts"));
const ours = ownShipped();
const own = Object.fromEntries(
  Object.entries(ownProjects).map(([project, framework]) => [
    project,
    framework.endsWith("-ssr")
      ? ownFiles.filter((file) =>
          opens(join(ownSpecs, file)).some((name) => ours[framework]?.includes(name)),
        )
      : ownFiles,
  ]),
);

export default {
  ...base,
  testDir: upstreamSpecs,
  outputDir: results,
  metadata: {
    expected,
    own,
    // The framework of each project that isn't named for its own.
    variants: Object.fromEntries(varied.map(({ name }) => [name, variedFramework])),
    args: process.env.SPECS_ARGS ?? "",
  },
  reporter: [[process.env.CI ? "dot" : "list"], ["json", { outputFile: report }]],
  projects: [
    // Specs that would only skip stay out of a project, as upstream's do.
    ...frameworks.map((framework) => ({
      name: framework,
      use: { browserName: "chromium" as const, framework },
      // A name upstream's allow-lists let through runs only the spec files for its fixtures.
      ...(framework.startsWith("effect")
        ? { testIgnore: specsThatSkip(framework) }
        : { testMatch: expected[framework]!.map((file) => `**/${file}`) }),
    })),
    ...varied.map(({ name, fixtureOptions, testMatch, testIgnore }) => ({
      name,
      use: { browserName: "chromium" as const, framework: variedFramework, fixtureOptions },
      testMatch,
      testIgnore,
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
