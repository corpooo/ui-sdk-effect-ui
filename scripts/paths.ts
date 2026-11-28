import { fileURLToPath } from "node:url";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Our fixtures: `<name>/effect.ts` and `<name>/effect-<variant>.ts`. */
export const fixtures = at("../fixtures/");
/** Fixtures of our own, which no upstream spec opens: `own/<name>/effect.ts`, served as `own-<name>`. */
export const ownFixtures = at("../fixtures/own/");
/** Specs of our own, for what upstream's fixtures don't draw. Each opens fixtures from `ownFixtures`. */
export const ownSpecs = at("../specs/");
/** The upstream checkout, a submodule this repository never commits into. */
export const upstream = at("../upstream/ui/");
/** Where the playground finds a fixture: `<name>/<framework>.ts`. */
export const upstreamFixtures = at("../upstream/ui/apps/playground/src/fixtures/");
export const upstreamCore = at("../upstream/ui/packages/core/");
export const upstreamTests = at("../upstream/ui/tests/");
export const upstreamPlayground = at("../upstream/ui/apps/playground/");
/** Upstream installs hoisted, so every package's binaries are here. */
export const upstreamBin = at("../upstream/ui/node_modules/.bin/");
/** Upstream's Vite, whose `preview` serves the playground from this process. */
export const upstreamVite = at("../upstream/ui/node_modules/vite/dist/node/index.js");
export const upstreamSpecs = at("../upstream/ui/tests/specs/");
/** What a spec run leaves for the coverage gate. */
export const results = at("../test-results/");
export const report = at("../test-results/report.json");
/** How many fixtures we had when it was last raised. The coverage gate fails below it. */
export const baseline = at("../coverage-baseline.json");
export const playwrightConfig = at("./playwright.config.ts");

/** Where the playground is served. Upstream's config reads the same variable for its base URL. */
export const port = process.env.PLAYGROUND_PORT ?? "5300";

/**
 * The Playwright projects the overlay adds, one per fixture file name.
 * `react-effect` is our fixture under a name upstream's allow-lists let
 * through: a test that names the frameworks it runs for, and skips the rest,
 * runs for us there. `fixtures/<name>/react-effect.ts` exports `effect.ts`'s.
 */
export const frameworks = ["effect", "effect-ssr", "react-effect"];

/** The framework whose fixtures run again in every other way upstream runs React's, like with popups in a container. */
export const variedFramework = "effect";

/** The Playwright projects that run our own specs, each with the framework whose fixture files it opens. */
export const ownProjects: Record<string, string> = { own: "effect", "own-ssr": "effect-ssr" };
