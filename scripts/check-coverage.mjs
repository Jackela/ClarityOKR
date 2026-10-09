import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import coverage from 'istanbul-lib-coverage';
import reporting from 'istanbul-lib-report';
import reports from 'istanbul-reports';

const merged = coverage.createCoverageMap({});
for (const directory of ['tests/unit', 'app/renderer', 'tests/integration']) {
  const input = JSON.parse(
    readFileSync(resolve(directory, 'coverage/coverage-final.json'), 'utf8'),
  );
  if (!Object.keys(input).length) throw new Error(`Empty coverage report: ${directory}`);
  merged.merge(input);
}
const summary = merged.getCoverageSummary().toJSON();
mkdirSync('coverage', { recursive: true });
writeFileSync('coverage/coverage-final.json', JSON.stringify(merged.toJSON()));
writeFileSync('coverage/coverage-summary.json', JSON.stringify({ total: summary }, null, 2));
const context = reporting.createContext({ dir: 'coverage', coverageMap: merged });
for (const format of ['text-summary', 'lcov', 'html']) reports.create(format).execute(context);
const failed = ['lines', 'statements', 'functions', 'branches']
  .map((name) => [name, summary[name]])
  .filter(([, metric]) => metric.total === 0 || metric.pct < 80);
if (failed.length) {
  console.error(JSON.stringify({ gate: 'coverage', minimum: 80, failed }, null, 2));
  process.exitCode = 1;
}
