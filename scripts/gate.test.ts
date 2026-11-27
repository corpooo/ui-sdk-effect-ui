import { expect, test } from "vite-plus/test";
import { problems, tally, type Report } from "./gate.ts";

const report = (tests: Record<string, string[]>): Report => ({
  config: {},
  suites: Object.entries(tests).map(([file, statuses]) => ({
    file,
    // Nested, as a `describe` block is.
    suites: [
      {
        file,
        specs: statuses.map((status) => ({ tests: [{ projectName: "effect", status }] })),
      },
    ],
  })),
});

const covered = {
  projects: ["effect"],
  expected: { effect: ["toggle.spec.ts"] },
  args: "",
  available: ["tabs", "toggle"],
  shipped: ["toggle"],
  baseline: 1,
  exempt: {},
};

test("tests are counted by spec file, inside describe blocks too", () => {
  const counts = tally(
    report({ "toggle.spec.ts": ["expected", "flaky", "skipped", "unexpected"] }),
  );
  expect(counts.get("effect")?.get("toggle.spec.ts")).toEqual({ passed: 2, skipped: 1, failed: 1 });
});

test("a run whose expected spec files ran tests has no problems", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected", "skipped"] }));
  expect(problems({ ...covered, counts })).toEqual([]);
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
  expect(problems({ ...covered, counts, baseline: 2 })).toEqual([
    "We ship 1 fixtures, fewer than the baseline of 2.",
  ]);
});

test("a fixture upstream has no React fixture for is a problem", () => {
  const counts = tally(report({ "toggle.spec.ts": ["expected"] }));
  expect(problems({ ...covered, counts, shipped: ["toggle", "togle"], baseline: 1 })).toEqual([
    "fixtures/togle has no React fixture of that name upstream, so no spec opens it.",
  ]);
});
