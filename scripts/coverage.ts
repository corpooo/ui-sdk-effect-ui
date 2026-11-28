// The coverage gate. A spec skips itself where a fixture is missing, so a
// run can be green while it checks nothing. After `pnpm specs`, this says
// which of upstream's fixtures we have and what ran for them, and fails when
// a spec file for a fixture we ship ran no test, a fixture we ship is opened
// by no spec, a test skipped for want of a fixture we have, or a fixture
// coverage-baseline.json names is gone, and when a spec file for a fixture
// we ship skips a test for us by its own rule, unless the baseline exempts
// that test, or its describe block or spec file, with why. Our own specs
// and fixtures are counted apart, and each own spec file must run a test,
// unless it holds only `test.fixme`s.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { interrupted, problems, ran, skips, tally, type Counts, type Report } from "./gate.ts";
import { opened, owned, ownShipped, shipped } from "./overlay.ts";
import {
  baseline as baselineFile,
  frameworks,
  ownProjects,
  report as reportFile,
  upstreamFixtures,
} from "./paths.ts";

if (!existsSync(reportFile)) {
  console.error("No spec run to check. Run `pnpm specs` first.");
  process.exit(1);
}
const report = JSON.parse(readFileSync(reportFile, "utf8")) as Report;
const { fixtures: baseline, exempt } = JSON.parse(readFileSync(baselineFile, "utf8")) as {
  fixtures: Record<string, string[]>;
  exempt: Record<string, string>;
};

// A fixture every adapter can have is one React has, as `<name>/react.tsx`.
const available = readdirSync(upstreamFixtures).filter((name) =>
  existsSync(join(upstreamFixtures, name, "react.tsx")),
);
const ours = shipped();
const ourOwn = ownShipped();
for (const framework of frameworks) {
  const names = ours[framework] ?? [];
  console.log(
    `${framework} fixtures: ${names.length} of upstream's ${available.length} (${names.join(", ")}).`,
  );
}
const own = owned();
console.log(`Own fixtures, counted apart: ${own.length} (${own.join(", ")}).`);

const counts = tally(report);
const {
  expected = {},
  own: ownFiles = {},
  variants = {},
  args = "",
} = report.config.metadata ?? {};
// Every project that runs upstream's specs: one per framework, and the ones that run a framework's fixtures another way.
const projects = [...frameworks, ...Object.keys(variants)];

const row = (file: string, { passed, skipped, failed, fixme }: Counts) =>
  `  ${file.padEnd(32)} ${passed} / ${skipped} / ${failed} / ${fixme}`;
const heading = (project: string) => `\n${project}: passed / skipped / failed / fixme`;
const sorted = (project: string) =>
  [...(counts.get(project) ?? [])].sort(([a], [b]) => a.localeCompare(b));

for (const project of projects) {
  const files = sorted(project);
  const tested = files.filter(([, count]) => ran(count));
  console.log(heading(project));
  for (const [file, count] of tested) {
    console.log(row(file, count));
  }
  // Specs that open no fixture by name load a page of their own, for another adapter.
  console.log(`  ${files.length - tested.length} more spec files only skipped.`);
}
for (const project of Object.keys(ownProjects)) {
  console.log(heading(project));
  for (const [file, count] of sorted(project)) {
    console.log(row(file, count));
  }
}

for (const [title, why] of Object.entries(exempt)) {
  console.log(`\nExempt: ${title}. ${why}`);
}

const found = problems({
  counts,
  projects,
  expected,
  ownProjects: Object.keys(ownProjects),
  own: ownFiles,
  args,
  interrupted: interrupted(report),
  frameworkOf: { ...ownProjects, ...variants },
  shipped: ours,
  ownShipped: ourOwn,
  opened: opened(),
  skips: skips(report),
  baseline,
  exempt,
});
if (found.length) {
  console.error(`\nNot covered:\n${found.map((problem) => `  ${problem}`).join("\n")}`);
  process.exit(1);
}
console.log("\nEvery spec file for a fixture we ship ran, and every spec of our own.");
