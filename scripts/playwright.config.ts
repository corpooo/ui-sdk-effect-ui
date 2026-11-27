// The upstream Playwright suite with our projects in place of its own. It
// lives here and reads the upstream config by path, so no file is added to
// the upstream checkout for it. Playwright runs it from `upstream/ui/tests`.
import {
  frameworks,
  report,
  results,
  upstreamBin,
  upstreamPlayground,
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

const port = process.env.PLAYGROUND_PORT ?? "5300";

export default {
  ...base,
  testDir: upstreamSpecs,
  outputDir: results,
  reporter: [[process.env.CI ? "dot" : "list"], ["json", { outputFile: report }]],
  // Specs that would only skip stay out of a project, as upstream's do.
  projects: frameworks.map((framework) => ({
    name: framework,
    use: { browserName: "chromium" as const, framework },
    testIgnore: specsThatSkip(framework),
  })),
  // A build, as upstream's CI serves: our fixtures are files outside the
  // playground, which its dev server refuses to serve. Only the client build:
  // the server builds render Vue, Svelte and Solid, which we don't run. The
  // binaries run directly: `pnpm` there would first switch to upstream's version.
  webServer: {
    command: `NODE_ENV=development ${upstreamBin}vite build && ${upstreamBin}vite preview --port ${port} --strictPort`,
    cwd: upstreamPlayground,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
};
