import { expect, test } from "vite-plus/test";
import { interrupted, missing, problems, tally, type Report } from "./gate.ts";

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
  interrupted: 0,
  frameworkOf: { own: "effect" },
  shipped: { effect: ["toggle"], "effect-ssr": ["toggle"] },
  ownShipped: { effect: ["own-tabs-keys"], "effect-ssr": [] },
  opened: ["toggle", "own-tabs-keys"],
  missing: [],
  baseline: { effect: ["toggle", "own-tabs-keys"], "effect-ssr": ["toggle"] },
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

test("a fixture the baseline names that we no longer ship is a problem", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  expect(
    problems({ ...covered, counts, shipped: { effect: ["toggle"], "effect-ssr": [] } }),
  ).toEqual(["coverage-baseline.json names toggle for effect-ssr, and we don't ship it."]);
});

test("a fixture no spec file opens is a problem", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  expect(
    problems({
      ...covered,
      counts,
      shipped: { effect: ["toggle", "toggle-kitchen-sink"], "effect-ssr": ["toggle"] },
    }),
  ).toEqual([
    "The fixture toggle-kitchen-sink is opened by no spec file, so nothing tests it.",
    "Name toggle-kitchen-sink under effect in coverage-baseline.json.",
  ]);
});

test("an own fixture no spec opens, or one the baseline names that is gone, is a problem", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  expect(problems({ ...covered, counts, opened: ["toggle"] })).toEqual([
    "The fixture own-tabs-keys is opened by no spec file, so nothing tests it.",
  ]);
  expect(
    problems({
      ...covered,
      counts,
      baseline: { effect: ["toggle", "own-tabs-keys"], "effect-ssr": ["toggle", "own-tabs-keys"] },
    }),
  ).toEqual(["coverage-baseline.json names own-tabs-keys for effect-ssr, and we don't ship it."]);
});

test("a run stopped with tests in flight is a problem", () => {
  const stopped: Report = {
    config: {},
    suites: [
      {
        file: "toggle.spec.ts",
        specs: [
          {
            tests: [{ projectName: "effect", status: "expected", results: [{ status: "passed" }] }],
          },
          {
            tests: [
              { projectName: "effect", status: "skipped", results: [{ status: "interrupted" }] },
            ],
          },
        ],
      },
    ],
  };
  expect(interrupted(stopped)).toBe(1);
  expect(problems({ ...covered, counts: tally(stopped), interrupted: 1 })).toEqual([
    "The run was stopped with 1 tests in flight. Run `pnpm specs` to the end.",
  ]);
});

test("a fixture the baseline doesn't name is a problem", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  expect(
    problems({ ...covered, counts, baseline: { effect: ["toggle", "own-tabs-keys"] } }),
  ).toEqual(["Name toggle under effect-ssr in coverage-baseline.json."]);
});

test("a test that skips for want of a fixture is a problem when we have it, or it is ours and gone", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  const skipped = (project: string, fixture: string) => ({
    ...covered,
    counts,
    missing: [{ project, file: "a.spec.ts", fixture }],
  });
  expect(problems(skipped("effect", "toggle"))).toEqual([
    "a.spec.ts skipped a test in effect for want of toggle, which we ship.",
  ]);
  expect(problems(skipped("own", "own-tabs-keyz"))).toEqual([
    "a.spec.ts opens own-tabs-keyz, and we have no fixture of that name.",
  ]);
  // Upstream's fixtures we don't ship, and our own a framework doesn't have, skip as they should.
  expect(problems(skipped("effect", "menu"))).toEqual([]);
  expect(problems(skipped("effect-ssr", "own-tabs-keys"))).toEqual([]);
});

test("a skip for a missing fixture is read from the report", () => {
  const skip = (description: string) => ({
    projectName: "own",
    status: "skipped",
    annotations: [{ type: "skip", description }],
  });
  const found = missing({
    config: {},
    suites: [
      {
        file: "../../../../specs/f.spec.ts",
        specs: [{ tests: [skip("No own-tabs-keyz fixture for effect."), skip("Only web.")] }],
      },
    ],
  });
  expect(found).toEqual([{ project: "own", file: "f.spec.ts", fixture: "own-tabs-keyz" }]);
});
