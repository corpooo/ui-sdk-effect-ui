// What the coverage gate decides, from data alone. `coverage.ts` reads the
// data and prints the result.

/** The part of Playwright's JSON report the gate reads. */
export type Report = {
  config: { metadata?: { expected?: Record<string, string[]> } };
  suites: Suite[];
};
type Suite = { file: string; specs?: Spec[]; suites?: Suite[] };
type Spec = { tests: { projectName: string; status: string }[] };

export type Counts = { passed: number; skipped: number; failed: number };

const specsOf = (suite: Suite): Spec[] => [
  ...(suite.specs ?? []),
  ...(suite.suites ?? []).flatMap(specsOf),
];

/** Each project's tests by spec file. A flaky test passed on a retry, so it counts as passed. */
export function tally(report: Report) {
  const counts = new Map<string, Map<string, Counts>>();
  for (const suite of report.suites) {
    for (const { projectName, status } of specsOf(suite).flatMap((spec) => spec.tests)) {
      let files = counts.get(projectName);
      if (!files) {
        counts.set(projectName, (files = new Map()));
      }
      let count = files.get(suite.file);
      if (!count) {
        files.set(suite.file, (count = { passed: 0, skipped: 0, failed: 0 }));
      }
      count[status === "skipped" ? "skipped" : status === "unexpected" ? "failed" : "passed"]++;
    }
  }
  return counts;
}

/**
 * Why the run doesn't cover what we ship, or nothing when it does.
 *
 * `expected` names, per project, the spec files that open a fixture we ship.
 * A spec skips itself where a fixture is missing, so a file that ran no test
 * means a run that was green while it checked nothing.
 */
export function problems(input: {
  counts: Map<string, Map<string, Counts>>;
  expected: Record<string, string[]>;
  /** Upstream's React fixtures, which name every fixture there is to have. */
  available: string[];
  shipped: string[];
  /** The number of fixtures we had when it was last raised. */
  baseline: number;
  /** Spec files that skip every test for us by their own rule, each with why. */
  exempt: Record<string, string>;
}) {
  const found: string[] = [];
  for (const [project, files] of Object.entries(input.expected)) {
    for (const file of files) {
      const count = input.counts.get(project)?.get(file);
      const ran = !!count && count.passed + count.failed > 0;
      if (!ran && !(file in input.exempt)) {
        found.push(`${file} opens a fixture we ship, and ran no test in ${project}.`);
      } else if (ran && file in input.exempt) {
        found.push(`${file} is exempt, and ran tests in ${project}. Remove its exemption.`);
      }
    }
  }
  for (const name of input.shipped) {
    if (!input.available.includes(name)) {
      found.push(
        `fixtures/${name} has no React fixture of that name upstream, so no spec opens it.`,
      );
    }
  }
  if (input.shipped.length < input.baseline) {
    found.push(
      `We ship ${input.shipped.length} fixtures, fewer than the baseline of ${input.baseline}.`,
    );
  }
  return found;
}
