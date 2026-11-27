import { fileURLToPath } from "node:url";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Our fixtures: `<name>/effect.ts` and `<name>/effect-<variant>.ts`. */
export const fixtures = at("../fixtures/");
/** The upstream checkout, a submodule this repository never commits into. */
export const upstream = at("../upstream/ui/");
/** Where the playground finds a fixture: `<name>/<framework>.ts`. */
export const upstreamFixtures = at("../upstream/ui/apps/playground/src/fixtures/");
export const upstreamCore = at("../upstream/ui/packages/core/");
export const upstreamTests = at("../upstream/ui/tests/");
export const upstreamPlayground = at("../upstream/ui/apps/playground/");
/** Upstream installs hoisted, so every package's binaries are here. */
export const upstreamBin = at("../upstream/ui/node_modules/.bin/");
export const upstreamSpecs = at("../upstream/ui/tests/specs/");
/** What a spec run leaves for the coverage gate. */
export const results = at("../test-results/");
export const report = at("../test-results/report.json");
/** How many fixtures we had when it was last raised. The coverage gate fails below it. */
export const baseline = at("../coverage-baseline.json");
export const playwrightConfig = at("./playwright.config.ts");

/** Where the playground is served. Upstream's config reads the same variable for its base URL. */
export const port = process.env.PLAYGROUND_PORT ?? "5300";

/** The Playwright projects the overlay adds, one per fixture file name. */
export const frameworks = ["effect", "effect-ssr"];
