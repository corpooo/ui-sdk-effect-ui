// The coverage gate. A spec skips itself where a fixture is missing, so a
// run can be green while it checks nothing. After `pnpm specs`, this says
// which of upstream's fixtures we have and what ran for them, and fails when
// a spec file for a fixture we ship ran no test, or we ship fewer fixtures
// than coverage-baseline.json says. A spec file that skips every test for us
// by its own rule is listed there as exempt, with why.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { problems, tally, type Report } from "./gate.ts";
import { shipped } from "./overlay.ts";
import {
  baseline as baselineFile,
  frameworks,
  report as reportFile,
  upstreamFixtures,
} from "./paths.ts";

if (!existsSync(reportFile)) {
  console.error("No spec run to check. Run `pnpm specs` first.");
  process.exit(1);
}
const report = JSON.parse(readFileSync(reportFile, "utf8")) as Report;
const { fixtures: baseline, exempt } = JSON.parse(readFileSync(baselineFile, "utf8")) as {
  fixtures: number;
  exempt: Record<string, string>;
};

// A fixture every adapter can have is one React has, as `<name>/react.tsx`.
const available = readdirSync(upstreamFixtures).filter((name) =>
  existsSync(join(upstreamFixtures, name, "react.tsx")),
);
const ours = shipped();
console.log(`Fixtures: ${ours.length} of upstream's ${available.length} (${ours.join(", ")}).`);
if (ours.length > baseline) {
  console.log(`That's more than the baseline of ${baseline}: raise it in coverage-baseline.json.`);
}

const counts = tally(report);
const expected = report.config.metadata?.expected ?? {};
for (const project of frameworks) {
  const files = [...(counts.get(project) ?? [])].sort(([a], [b]) => a.localeCompare(b));
  const ran = files.filter(([, count]) => count.passed + count.failed > 0);
  console.log(`\n${project}: passed / skipped / failed`);
  for (const [file, { passed, skipped, failed }] of ran) {
    console.log(`  ${file.padEnd(32)} ${passed} / ${skipped} / ${failed}`);
  }
  // Specs that open no fixture by name load a page of their own, for another adapter.
  console.log(`  ${files.length - ran.length} more spec files only skipped.`);
}

for (const [file, why] of Object.entries(exempt)) {
  console.log(`\nExempt: ${file}. ${why}`);
}

const found = problems({ counts, expected, available, shipped: ours, baseline, exempt });
if (found.length) {
  console.error(`\nNot covered:\n${found.map((problem) => `  ${problem}`).join("\n")}`);
  process.exit(1);
}
console.log("\nEvery spec file for a fixture we ship ran.");
