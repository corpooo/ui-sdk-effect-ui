// What the coverage gate decides, from data alone. `coverage.ts` reads the
// data and prints the result.
import { basename } from "node:path";

/** The part of Playwright's JSON report the gate reads. */
export type Report = {
  config: {
    metadata?: {
      expected?: Record<string, string[]>;
      own?: Record<string, string[]>;
      args?: string;
    };
  };
  suites: Suite[];
};
type Suite = { file: string; specs?: Spec[]; suites?: Suite[] };
type Spec = {
  tests: {
    projectName: string;
    status: string;
    annotations?: { type: string; description?: string }[];
  }[];
};

/** A `test.fixme` counts as `fixme`, not `skipped`. */
export type Counts = { passed: number; skipped: number; failed: number; fixme: number };

/** Whether any test of the file ran. */
export const ran = (count: Counts | undefined) => !!count && count.passed + count.failed > 0;

const specsOf = (suite: Suite): Spec[] => [
  ...(suite.specs ?? []),
  ...(suite.suites ?? []).flatMap(specsOf),
];

type Test = Spec["tests"][number];
const outcome = ({ status, annotations = [] }: Test): keyof Counts => {
  if (status === "skipped") {
    return annotations.some(({ type }) => type === "fixme") ? "fixme" : "skipped";
  }
  if (status === "unexpected") {
    return "failed";
  }
  // A flaky test passed on a retry, so it counts as passed.
  return "passed";
};

/**
 * Each project's tests by spec file. Spec directories are flat, and a
 * project runs one of them, so a file is named by its base name: the report
 * names our own specs by their path from upstream's.
 */
export function tally(report: Report) {
  const counts = new Map<string, Map<string, Counts>>();
  for (const suite of report.suites) {
    const file = basename(suite.file);
    for (const test of specsOf(suite).flatMap((spec) => spec.tests)) {
      let files = counts.get(test.projectName);
      if (!files) {
        counts.set(test.projectName, (files = new Map()));
      }
      let count = files.get(file);
      if (!count) {
        files.set(file, (count = { passed: 0, skipped: 0, failed: 0, fixme: 0 }));
      }
      count[outcome(test)]++;
    }
  }
  return counts;
}

/** Each test that skipped itself because a fixture it opens is missing, as upstream's `open` says. */
export function missing(report: Report) {
  const found: { project: string; file: string; fixture: string }[] = [];
  for (const suite of report.suites) {
    for (const test of specsOf(suite).flatMap((spec) => spec.tests)) {
      for (const { description = "" } of test.annotations ?? []) {
        const fixture = /^No ([\w-]+) fixture for /.exec(description)?.[1];
        if (fixture) {
          found.push({ project: test.projectName, file: basename(suite.file), fixture });
        }
      }
    }
  }
  return found;
}

/**
 * Why the run doesn't cover what we ship, or nothing when it does.
 *
 * `expected` names, per project, the spec files that open a fixture we ship.
 * A spec skips itself where a fixture is missing, so a file that ran no test
 * means a run that was green while it checked nothing. `own` names, per own
 * project, our own spec files, which must each run a test too, unless all
 * their tests are `test.fixme`s.
 */
export function problems(input: {
  counts: Map<string, Map<string, Counts>>;
  /** The projects the run should have had. */
  projects: string[];
  expected: Record<string, string[]>;
  /** The projects that run our own specs. */
  ownProjects: string[];
  own: Record<string, string[]>;
  /** The Playwright arguments that narrowed the run, empty for a run of everything. */
  args: string;
  /** The framework each project runs. */
  frameworkOf: Record<string, string>;
  /** The fixtures we ship, and our own, by framework. */
  shipped: Record<string, string[]>;
  ownShipped: Record<string, string[]>;
  /** Every fixture some spec file opens by name. */
  opened: string[];
  /** The tests that skipped for a missing fixture. */
  missing: { project: string; file: string; fixture: string }[];
  /** The fixtures each framework must keep shipping. */
  baseline: Record<string, string[]>;
  /** Spec files that skip every test for us by their own rule, each with why. */
  exempt: Record<string, string>;
}) {
  const found: string[] = [];
  if (input.args) {
    found.push(`The run was narrowed with "${input.args}". Run \`pnpm specs\` with no arguments.`);
  }
  for (const project of input.projects) {
    const files = input.expected[project] ?? [];
    // No list is a report the run never finished writing, or a project with no fixture.
    if (files.length === 0) {
      found.push(`The run names no spec file that opens a fixture we ship for ${project}.`);
    }
    for (const file of files) {
      const tests = ran(input.counts.get(project)?.get(file));
      if (!tests && !(file in input.exempt)) {
        found.push(`${file} opens a fixture we ship, and ran no test in ${project}.`);
      } else if (tests && file in input.exempt) {
        found.push(`${file} is exempt, and ran tests in ${project}. Remove its exemption.`);
      }
    }
  }
  for (const project of input.ownProjects) {
    const files = input.own[project] ?? [];
    if (files.length === 0) {
      found.push(`The run names no spec file of our own for ${project}.`);
    }
    for (const file of files) {
      const count = input.counts.get(project)?.get(file);
      const planned = !!count && count.fixme > 0 && count.skipped === 0;
      if (!ran(count) && !planned) {
        found.push(`${file} is a spec of our own, and ran no test in ${project}.`);
      }
    }
  }
  const all = (framework: string) => [
    ...(input.shipped[framework] ?? []),
    ...(input.ownShipped[framework] ?? []),
  ];
  for (const name of new Set(
    [...Object.values(input.shipped), ...Object.values(input.ownShipped)].flat(),
  )) {
    if (!input.opened.includes(name)) {
      found.push(`The fixture ${name} is opened by no spec file, so nothing tests it.`);
    }
  }
  // A missing fixture of ours is a run that lost its links, or a spec that names one we don't have.
  const allOwn = new Set(Object.values(input.ownShipped).flat());
  for (const { project, file, fixture } of input.missing) {
    const framework = input.frameworkOf[project] ?? project;
    if (all(framework).includes(fixture)) {
      found.push(`${file} skipped a test in ${project} for want of ${fixture}, which we ship.`);
    } else if (fixture.startsWith("own-") && !allOwn.has(fixture)) {
      found.push(`${file} opens ${fixture}, and we have no fixture of that name.`);
    }
  }
  // Both ways: a fixture it names that went, and one it doesn't name, which nothing would miss.
  for (const [framework, names] of Object.entries(input.baseline)) {
    for (const name of names) {
      if (!all(framework).includes(name)) {
        found.push(`coverage-baseline.json names ${name} for ${framework}, and we don't ship it.`);
      }
    }
  }
  for (const framework of new Set([
    ...Object.keys(input.shipped),
    ...Object.keys(input.ownShipped),
  ])) {
    for (const name of all(framework)) {
      if (!input.baseline[framework]?.includes(name)) {
        found.push(`Name ${name} under ${framework} in coverage-baseline.json.`);
      }
    }
  }
  return [...new Set(found)];
}
