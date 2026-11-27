// The coverage gate. A spec skips itself where a fixture is missing, so a
// run can be green while it checks nothing. After `pnpm specs`, this says
// which of upstream's fixtures we have and what ran for them, and fails when
// a spec file for a fixture we ship ran no test, a fixture we ship is opened
// by no spec, a test skipped for want of a fixture we have, or a fixture
// coverage-baseline.json names is gone. A spec file that skips every test
// for us by its own rule is listed there as exempt, with why. Our own specs
// and fixtures are counted apart, and each own spec file must run a test,
// unless it holds only `test.fixme`s.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { missing, problems, ran, tally, type Counts, type Report } from "./gate.ts";
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
  const unnamed = [...names, ...(ourOwn[framework] ?? [])].filter(
    (name) => !baseline[framework]?.includes(name),
  );
  if (unnamed.length) {
    console.log(`Add ${unnamed.join(", ")} to ${framework} in coverage-baseline.json.`);
  }
}
const own = owned();
console.log(`Own fixtures, counted apart: ${own.length} (${own.join(", ")}).`);

const counts = tally(report);
const { expected = {}, own: ownFiles = {}, args = "" } = report.config.metadata ?? {};

const row = (file: string, { passed, skipped, failed, fixme }: Counts) =>
  `  ${file.padEnd(32)} ${passed} / ${skipped} / ${failed} / ${fixme}`;
const heading = (project: string) => `\n${project}: passed / skipped / failed / fixme`;
const sorted = (project: string) =>
  [...(counts.get(project) ?? [])].sort(([a], [b]) => a.localeCompare(b));

for (const project of frameworks) {
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

for (const [file, why] of Object.entries(exempt)) {
  console.log(`\nExempt: ${file}. ${why}`);
}

const found = problems({
  counts,
  projects: frameworks,
  expected,
  ownProjects: Object.keys(ownProjects),
  own: ownFiles,
  args,
  frameworkOf: ownProjects,
  shipped: ours,
  ownShipped: ourOwn,
  opened: opened(),
  missing: missing(report),
  baseline,
  exempt,
});
if (found.length) {
  console.error(`\nNot covered:\n${found.map((problem) => `  ${problem}`).join("\n")}`);
  process.exit(1);
}
console.log("\nEvery spec file for a fixture we ship ran, and every spec of our own.");
