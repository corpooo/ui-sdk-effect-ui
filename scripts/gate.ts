// What the coverage gate decides, from data alone. `coverage.ts` reads the
// data and prints the result.
import { basename } from "node:path";

/** The part of Playwright's JSON report the gate reads. */
export type Report = {
  config: {
    metadata?: {
      expected?: Record<string, string[]>;
      own?: Record<string, string[]>;
      variants?: Record<string, string>;
      args?: string;
    };
  };
  suites: Suite[];
};
type Suite = { file: string; title: string; specs?: Spec[]; suites?: Suite[] };
type Spec = {
  title: string;
  tests: {
    projectName: string;
    status: string;
    annotations?: { type: string; description?: string }[];
    results?: { status: string }[];
  }[];
};

/** A `test.fixme` counts as `fixme`, not `skipped`. */
export type Counts = { passed: number; skipped: number; failed: number; fixme: number };

/** Whether any test of the file ran. */
export const ran = (count: Counts | undefined) => !!count && count.passed + count.failed > 0;

type Test = Spec["tests"][number];

/**
 * Every test of the run, with its spec file and its title path, as
 * `file › describe › title`. Spec directories are flat, and a project runs
 * one of them, so a file is named by its base name: the report names our own
 * specs by their path from upstream's.
 */
const testsOf = (report: Report) =>
  report.suites.flatMap((suite) => {
    const file = basename(suite.file);
    const inside = (
      { specs = [], suites = [] }: Suite,
      path: string,
    ): { title: string; test: Test }[] => [
      ...specs.flatMap((spec) =>
        spec.tests.map((test) => ({ title: `${path} › ${spec.title}`, test })),
      ),
      ...suites.flatMap((child) => inside(child, `${path} › ${child.title}`)),
    ];
    return inside(suite, file).map((found) => ({ file, ...found }));
  });

const stopped = (test: Test) => !!test.results?.some(({ status }) => status === "interrupted");
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

/** Each project's tests by spec file. */
export function tally(report: Report) {
  const counts = new Map<string, Map<string, Counts>>();
  for (const { file, test } of testsOf(report)) {
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
  return counts;
}

/** How many tests a stopped run cut short. Playwright reports each as skipped. */
export const interrupted = (report: Report) =>
  testsOf(report).filter(({ test }) => stopped(test)).length;

/** A test that skipped itself, with the fixture it wanted when it skipped for want of one, as upstream's `open` says. */
export type Skip = { project: string; file: string; title: string; fixture?: string };

/** Each test that skipped, by `test.skip` or `test.fixme`, leaving out tests a stopped run cut short. */
export const skips = (report: Report): Skip[] =>
  testsOf(report)
    .filter(({ test }) => test.status === "skipped" && !stopped(test))
    .map(({ file, title, test }) => {
      const fixture = (test.annotations ?? [])
        .map(({ description = "" }) => /^No ([\w-]+) fixture for /.exec(description)?.[1])
        .find(Boolean);
      return { project: test.projectName, file, title, ...(fixture && { fixture }) };
    });

/** Each test that passed, by project and title path. */
export const passes = (report: Report) =>
  testsOf(report)
    .filter(({ test }) => outcome(test) === "passed")
    .map(({ title, test }) => ({ project: test.projectName, title }));

/**
 * Why tests skip for us by their spec file's own rule. A test that runs for
 * us elsewhere names the projects it runs in, where the exemption doesn't
 * hold and the test must pass, as the portal project runs a portal's tests.
 */
export type Exemption = string | { readonly why: string; readonly runsIn: string[] };

/** Why the tests skip, and the projects they run in. */
export const exemptionOf = (exemption: Exemption) =>
  typeof exemption === "string" ? { why: exemption, runsIn: [] } : exemption;

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
  /** How many tests the run was stopped in the middle of. */
  interrupted: number;
  /** The framework each project runs. */
  frameworkOf: Record<string, string>;
  /** The fixtures we ship, and our own, by framework. */
  shipped: Record<string, string[]>;
  ownShipped: Record<string, string[]>;
  /** Every fixture some spec file opens by name. */
  opened: string[];
  /** The tests that skipped. */
  skips: Skip[];
  /** The tests that passed. */
  passes: { project: string; title: string }[];
  /** The fixtures each framework must keep shipping. */
  baseline: Record<string, string[]>;
  /** The tests that skip for us by their spec file's own rule: a test, or the describe block or spec file it is in, by title path. */
  exempt: Record<string, Exemption>;
}) {
  const found: string[] = [];
  if (input.interrupted) {
    found.push(
      `The run was stopped with ${input.interrupted} tests in flight. Run \`pnpm specs\` to the end.`,
    );
  }
  if (input.args) {
    found.push(`The run was narrowed with "${input.args}". Run \`pnpm specs\` with no arguments.`);
  }
  const all = (framework: string) => [
    ...(input.shipped[framework] ?? []),
    ...(input.ownShipped[framework] ?? []),
  ];
  const allOwn = new Set(Object.values(input.ownShipped).flat());
  const runsIn = (key: string) => exemptionOf(input.exempt[key]!).runsIn;
  const under = (title: string, key: string) => `${title} › `.startsWith(`${key} › `);
  // The exemptions that cover a test in a project, which one doesn't in a project it runs in.
  const exemptions = (title: string, project: string) =>
    Object.keys(input.exempt).filter((key) => under(title, key) && !runsIn(key).includes(project));
  for (const project of input.projects) {
    const files = input.expected[project] ?? [];
    // No list is a report the run never finished writing, or a project with no fixture.
    if (files.length === 0) {
      found.push(`The run names no spec file that opens a fixture we ship for ${project}.`);
    }
    for (const file of files) {
      // A file that opens a fixture we ship runs nothing only where the baseline exempts the file.
      if (!ran(input.counts.get(project)?.get(file)) && exemptions(file, project).length === 0) {
        found.push(`${file} opens a fixture we ship, and ran no test in ${project}.`);
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
  for (const name of new Set(
    [...Object.values(input.shipped), ...Object.values(input.ownShipped)].flat(),
  )) {
    if (!input.opened.includes(name)) {
      found.push(`The fixture ${name} is opened by no spec file, so nothing tests it.`);
    }
  }
  // A missing fixture of ours is a run that lost its links, or a spec that names one we don't have.
  // Any other skip in a spec file that opens a fixture we ship is its own rule, which the baseline explains.
  const used = new Set<string>();
  for (const { project, file, title, fixture } of input.skips) {
    const framework = input.frameworkOf[project] ?? project;
    if (fixture) {
      if (all(framework).includes(fixture)) {
        found.push(`${file} skipped a test in ${project} for want of ${fixture}, which we ship.`);
      } else if (fixture.startsWith("own-") && !allOwn.has(fixture)) {
        found.push(`${file} opens ${fixture}, and we have no fixture of that name.`);
      }
    } else if (input.expected[project]?.includes(file)) {
      const keys = exemptions(title, project);
      keys.forEach((key) => used.add(key));
      if (keys.length === 0) {
        found.push(
          `${title} skipped in ${project} by its own rule. Exempt it in coverage-baseline.json, with why.`,
        );
      }
    }
  }
  for (const key of Object.keys(input.exempt)) {
    if (!used.has(key)) {
      found.push(
        `coverage-baseline.json exempts ${key}, which skipped no test. Remove its exemption.`,
      );
    }
    // A test that runs only elsewhere runs nowhere once it skips there too.
    for (const project of runsIn(key)) {
      if (!input.passes.some((pass) => pass.project === project && under(pass.title, key))) {
        found.push(
          `coverage-baseline.json says ${key} runs in ${project}, and no test of it passed there.`,
        );
      }
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
