import { appendFileSync, readFileSync } from 'node:fs';
import {
  evaluateDirectories,
  evaluateGate,
  formatDirectorySummary,
  formatJobSummary,
  loadThresholds,
} from './coverage-gate.mjs';

const { total, directories } = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const config = loadThresholds();
const result = evaluateGate(total, config.thresholds);
const perDirectory = evaluateDirectories(directories, config);
const markdown = formatJobSummary(result.rows) + formatDirectorySummary(perDirectory.rows);
process.stdout.write(markdown);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}
if (!result.passed) {
  console.error(
    JSON.stringify(
      { gate: 'coverage', thresholds: config.thresholds, failed: result.rows.filter((row) => !row.ok) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
if (!perDirectory.passed) {
  console.error(
    JSON.stringify({ gate: 'directory coverage', failed: perDirectory.failed }, null, 2),
  );
  process.exitCode = 1;
}
