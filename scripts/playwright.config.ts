// The upstream Playwright suite with our projects in place of its own. It
// lives here and reads the upstream config by path, so no file is added to
// the upstream checkout for it. Playwright runs it from `upstream/ui/tests`.
import { frameworks, report, results, upstreamSpecs, upstreamTests } from "./paths.ts";

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

export default {
  ...base,
  testDir: upstreamSpecs,
  outputDir: results,
  metadata: { expected, args: process.env.SPECS_ARGS ?? "" },
  reporter: [[process.env.CI ? "dot" : "list"], ["json", { outputFile: report }]],
  // Specs that would only skip stay out of a project, as upstream's do.
  projects: frameworks.map((framework) => ({
    name: framework,
    use: { browserName: "chromium" as const, framework },
    testIgnore: specsThatSkip(framework),
  })),
  // `specs.ts` builds and serves the playground, so it can stop the server on every way out.
  webServer: undefined,
};
