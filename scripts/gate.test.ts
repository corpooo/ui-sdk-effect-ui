import { expect, test } from "vite-plus/test";
import { problems, tally, type Report } from "./gate.ts";

// A test as the report gives it: by its status, or as "fixme" for a `test.fixme`.
const entry = (projectName: string, status: string) =>
  status === "fixme"
    ? { projectName, status: "skipped", annotations: [{ type: "fixme" }] }
    : { projectName, status };

const report = (tests: Record<string, string[]>, projectName = "effect"): Report => ({
  config: {},
  suites: Object.entries(tests).map(([file, statuses]) => ({
    file,
    // Nested, as a `describe` block is.
    suites: [{ file, specs: statuses.map((status) => ({ tests: [entry(projectName, status)] })) }],
  })),
});

// Our own specs, named by their path from upstream's spec directory, as the report names them.
const ownReport = (statuses: string[]) =>
  report({ "../../../../specs/tabs-keys.spec.ts": statuses }, "own").suites;

const covered = {
  projects: ["effect"],
  expected: { effect: ["toggle.spec.ts"] },
  ownProjects: [],
  own: {},
  args: "",
  available: ["tabs", "toggle"],
  shipped: { effect: ["toggle"], "effect-ssr": ["toggle"] },
  baseline: { effect: 1, "effect-ssr": 1 },
  exempt: {},
};

test("tests are counted by spec file, inside describe blocks too", () => {
  const counts = tally(
    report({
      "toggle.spec.ts": ["expected", "flaky", "skipped", "unexpected", "fixme"],
    }),
  );
  expect(counts.get("effect")?.get("toggle.spec.ts")).toEqual({
    passed: 2,
    skipped: 1,
    failed: 1,
    fixme: 1,
  });
});

test("a run whose expected spec files ran tests has no problems", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected", "skipped"] }));
  expect(problems({ ...covered, counts })).toEqual([]);
});

const withOwn = { ...covered, ownProjects: ["own"], own: { own: ["tabs-keys.spec.ts"] } };
const ownCounts = (statuses: string[]) => {
  const upstream = report({ "toggle.spec.ts": ["expected"] });
  return tally({ ...upstream, suites: [...upstream.suites, ...ownReport(statuses)] });
};

test("a spec of our own is counted by its file name", () => {
  expect(ownCounts(["expected"]).get("own")?.get("tabs-keys.spec.ts")?.passed).toBe(1);
});

test("a spec of our own that ran a test has no problems", () => {
  expect(problems({ ...withOwn, counts: ownCounts(["expected", "fixme"]) })).toEqual([]);
});

test("a spec of our own that only skipped, or is missing from the run, is a problem", () => {
  const problem = "tabs-keys.spec.ts is a spec of our own, and ran no test in own.";
  expect(problems({ ...withOwn, counts: ownCounts(["skipped"]) })).toEqual([problem]);
  expect(problems({ ...withOwn, counts: ownCounts(["skipped", "fixme"]) })).toEqual([problem]);
  expect(problems({ ...withOwn, counts: ownCounts([]) })).toEqual([problem]);
});

test("a spec of our own whose tests are all fixmes is a plan, not a problem", () => {
  expect(problems({ ...withOwn, counts: ownCounts(["fixme", "fixme"]) })).toEqual([]);
});

test("a run that names no spec of our own for an own project is a problem", () => {
  expect(problems({ ...withOwn, own: {}, counts: ownCounts(["expected"]) })).toEqual([
    "The run names no spec file of our own for own.",
  ]);
});

test("a spec of our own never stands in for a spec file of upstream's", () => {
  const counts = tally({ config: {}, suites: ownReport(["expected"]) });
  expect(problems({ ...withOwn, counts })).toEqual([
    "toggle.spec.ts opens a fixture we ship, and ran no test in effect.",
  ]);
});

test("a spec file for a fixture we ship that only skipped is a problem", () => {
  const counts = tally(report({ "toggle.spec.ts": ["skipped", "skipped"] }));
  expect(problems({ ...covered, counts })).toEqual([
    "toggle.spec.ts opens a fixture we ship, and ran no test in effect.",
  ]);
});

test("a spec file for a fixture we ship that is missing from the run is a problem", () => {
  expect(problems({ ...covered, counts: tally(report({})) })).toEqual([
    "toggle.spec.ts opens a fixture we ship, and ran no test in effect.",
  ]);
});

test("an exempt spec file may run no test, and must not run any", () => {
  const exempt = { "toggle.spec.ts": "Skips every framework but web." };
  expect(
    problems({ ...covered, exempt, counts: tally(report({ "toggle.spec.ts": ["skipped"] })) }),
  ).toEqual([]);
  expect(
    problems({ ...covered, exempt, counts: tally(report({ "toggle.spec.ts": ["expected"] })) }),
  ).toEqual(["toggle.spec.ts is exempt, and ran tests in effect. Remove its exemption."]);
});

test("a run that names no spec files for a project is a problem", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  expect(problems({ ...covered, counts, expected: {} })).toEqual([
    "The run names no spec file that opens a fixture we ship for effect.",
  ]);
});

test("a run narrowed by Playwright arguments is a problem", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  expect(problems({ ...covered, counts, args: "-g pressed" })).toEqual([
    'The run was narrowed with "-g pressed". Run `pnpm specs` with no arguments.',
  ]);
});

test("fewer fixtures than the baseline is a problem", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  expect(problems({ ...covered, counts, baseline: { effect: 2, "effect-ssr": 1 } })).toEqual([
    "We ship 1 effect fixtures, fewer than the baseline of 2.",
  ]);
});

test("a hydration fixture that goes missing is a problem", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  expect(
    problems({ ...covered, counts, shipped: { effect: ["toggle"], "effect-ssr": [] } }),
  ).toEqual(["We ship 0 effect-ssr fixtures, fewer than the baseline of 1."]);
});

test("a fixture upstream has no React fixture for is a problem", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  expect(
    problems({ ...covered, counts, shipped: { effect: ["toggle", "togle"] }, baseline: {} }),
  ).toEqual(["fixtures/togle has no React fixture of that name upstream, so no spec opens it."]);
});
