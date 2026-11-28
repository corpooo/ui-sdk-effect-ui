import { expect, test } from "vite-plus/test";
import { interrupted, problems, skips, tally, type Report } from "./gate.ts";

// A test as the report gives it: by its status, or as "fixme" for a `test.fixme`.
const entry = (projectName: string, status: string) =>
  status === "fixme"
    ? { projectName, status: "skipped", annotations: [{ type: "fixme" }] }
    : { projectName, status };

// Each test is titled by its place, inside a `describe` block titled "group".
const report = (tests: Record<string, string[]>, projectName = "effect"): Report => ({
  config: {},
  suites: Object.entries(tests).map(([file, statuses]) => ({
    file,
    title: file,
    suites: [
      {
        file,
        title: "group",
        specs: statuses.map((status, index) => ({
          title: `test ${index}`,
          tests: [entry(projectName, status)],
        })),
      },
    ],
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
  skips: [],
  passes: [],
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

test("an exempt spec file may run no test, and its exemption must skip one", () => {
  const exempt = { "toggle.spec.ts": "Skips every framework but web." };
  const skip = {
    project: "effect",
    file: "toggle.spec.ts",
    title: "toggle.spec.ts › group › test 0",
  };
  expect(
    problems({
      ...covered,
      exempt,
      counts: tally(report({ "toggle.spec.ts": ["skipped"] })),
      skips: [skip],
    }),
  ).toEqual([]);
  expect(
    problems({ ...covered, exempt, counts: tally(report({ "toggle.spec.ts": ["expected"] })) }),
  ).toEqual([
    "coverage-baseline.json exempts toggle.spec.ts, which skipped no test. Remove its exemption.",
  ]);
});

test("a spec file runs no test in a project only where the baseline exempts the file there", () => {
  // Every test skipped, by the file's own rule or for a fixture we don't ship.
  const counts = tally(report({ "toggle.spec.ts": ["skipped", "skipped"] }));
  const byRule = {
    project: "effect",
    file: "toggle.spec.ts",
    title: "toggle.spec.ts › group › test 0",
  };
  const noFixture = {
    ...byRule,
    title: "toggle.spec.ts › group › test 1",
    fixture: "toggle-cases",
  };
  const skipped = { ...covered, counts, skips: [byRule, noFixture] };
  const ranNone = "toggle.spec.ts opens a fixture we ship, and ran no test in effect.";
  // Exempting the test leaves the file to have run nothing.
  expect(problems({ ...skipped, exempt: { [byRule.title]: "Server-rendered only." } })).toEqual([
    ranNone,
  ]);
  expect(problems({ ...skipped, exempt: { "toggle.spec.ts": "Web only." } })).toEqual([]);
  // A file exemption that names where the file runs doesn't hold there.
  const elsewhere = { "toggle.spec.ts": { why: "Client-rendered only.", runsIn: ["effect"] } };
  expect(problems({ ...skipped, exempt: elsewhere })).toEqual([
    ranNone,
    `${byRule.title} skipped in effect by its own rule. Exempt it in coverage-baseline.json, with why.`,
    "coverage-baseline.json exempts toggle.spec.ts, which skipped no test. Remove its exemption.",
    "coverage-baseline.json says toggle.spec.ts runs in effect, and no test of it passed there.",
  ]);
});

test("a test that a spec file for a fixture we ship skips by its own rule is a problem, unless exempt", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  const title = "toggle.spec.ts › controlled › closing returns focus";
  const skipped = {
    ...covered,
    counts,
    skips: [{ project: "effect", file: "toggle.spec.ts", title }],
  };
  const problem = `${title} skipped in effect by its own rule. Exempt it in coverage-baseline.json, with why.`;
  expect(problems(skipped)).toEqual([problem]);
  // An exemption names a test, or the describe block or spec file it is in.
  for (const key of [title, "toggle.spec.ts › controlled", "toggle.spec.ts"]) {
    expect(problems({ ...skipped, exempt: { [key]: "React, Vue and Svelte only." } })).toEqual([]);
  }
  // A title the test's only starts with names another block.
  expect(problems({ ...skipped, exempt: { "toggle.spec.ts › control": "Typo." } })).toEqual([
    problem,
    "coverage-baseline.json exempts toggle.spec.ts › control, which skipped no test. Remove its exemption.",
  ]);
  // A spec file that opens no fixture we ship loads a page for another adapter, and skips as it should.
  const elsewhere = { project: "effect", file: "menu.spec.ts", title: "menu.spec.ts › opens" };
  expect(problems({ ...skipped, skips: [elsewhere] })).toEqual([]);
});

test("an exempt test that runs elsewhere must pass there, and its exemption holds only outside", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  const title = "toggle.spec.ts › controlled › closing returns focus";
  const skip = (project: string) => ({ project, file: "toggle.spec.ts", title });
  const exempt = {
    "toggle.spec.ts › controlled": { why: "React only.", runsIn: ["react-effect"] },
  };
  const input = {
    ...covered,
    projects: ["effect", "react-effect"],
    expected: { effect: ["toggle.spec.ts"], "react-effect": ["toggle.spec.ts"] },
    counts: new Map([...counts, ["react-effect", counts.get("effect")!]]),
    exempt,
    skips: [skip("effect")],
  };
  expect(problems({ ...input, passes: [{ project: "react-effect", title }] })).toEqual([]);
  // It skipped there too, so it ran nowhere.
  expect(problems({ ...input, skips: [skip("effect"), skip("react-effect")] })).toEqual([
    `${title} skipped in react-effect by its own rule. Exempt it in coverage-baseline.json, with why.`,
    "coverage-baseline.json says toggle.spec.ts › controlled runs in react-effect, and no test of it passed there.",
  ]);
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
        title: "toggle.spec.ts",
        specs: [
          {
            title: "passes",
            tests: [{ projectName: "effect", status: "expected", results: [{ status: "passed" }] }],
          },
          {
            title: "stopped",
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
    skips: [{ project, file: "a.spec.ts", title: "a.spec.ts › opens", fixture }],
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

test("each skip is read from the report by its title, with the fixture it wanted", () => {
  const skip = (title: string, description: string) => ({
    title,
    tests: [
      { projectName: "own", status: "skipped", annotations: [{ type: "skip", description }] },
    ],
  });
  const file = "../../../../specs/f.spec.ts";
  const found = skips({
    config: {},
    suites: [
      {
        file,
        title: file,
        specs: [skip("opens", "No own-tabs-keyz fixture for effect.")],
        suites: [
          {
            file,
            title: "controlled",
            specs: [
              skip("closes", "Only web."),
              { title: "planned", tests: [entry("own", "fixme")] },
              { title: "runs", tests: [entry("own", "expected")] },
              {
                title: "stopped",
                tests: [{ ...entry("own", "skipped"), results: [{ status: "interrupted" }] }],
              },
            ],
          },
        ],
      },
    ],
  });
  expect(found).toEqual([
    { project: "own", file: "f.spec.ts", title: "f.spec.ts › opens", fixture: "own-tabs-keyz" },
    { project: "own", file: "f.spec.ts", title: "f.spec.ts › controlled › closes" },
  ]);
});
