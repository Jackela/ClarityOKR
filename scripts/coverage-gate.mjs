import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const METRICS = ['statements', 'branches', 'functions', 'lines'];

const defaultThresholdsPath = join(dirname(fileURLToPath(import.meta.url)), 'coverage-thresholds.json');

export function loadThresholds(path = defaultThresholdsPath) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Floor a measured percentage to an integer, never below minimumFloor (default 80). */
export function floorThreshold(pct, minimumFloor = 80) {
  if (typeof pct !== 'number' || Number.isNaN(pct)) {
    throw new TypeError(`coverage percent must be a number, got ${pct}`);
  }
  return Math.max(Math.floor(pct), minimumFloor);
}

/**
 * #151: a directory's threshold is its measured coverage on main, floored, never below the
 * global threshold for that metric.
 */
export function directoryThreshold(pct, globalThreshold) {
  return Math.max(floorThreshold(pct, 0), globalThreshold);
}

/**
 * Evaluates every directory in `config.directories` against its thresholds. A directory with no
 * summary (no files measured) fails.
 * @param {Record<string, Record<string, { total?: number, pct?: number }>> | undefined} summaries
 */
export function evaluateDirectories(summaries, config) {
  const rows = Object.entries(config.directories ?? {}).map(([directory, gate]) => {
    const summary = summaries?.[directory];
    const { rows: metrics, passed } = evaluateGate(summary, gate.thresholds);
    return { directory, metrics, passed: Boolean(summary?.files) && passed, files: summary?.files ?? 0 };
  });
  const failed = rows
    .filter((row) => !row.passed)
    .map((row) => ({
      directory: row.directory,
      files: row.files,
      metrics: row.metrics.filter((metric) => !metric.ok),
    }));
  return { rows, passed: failed.length === 0, failed };
}

/** One Job Summary row per directory: each metric as current / threshold. */
export function formatDirectorySummary(rows, { heading = 'Directory coverage gates (#151)' } = {}) {
  const lines = [
    `## ${heading}`,
    '',
    `| Directory | Files | ${METRICS.join(' | ')} | Result |`,
    `| --- | ---: | ${METRICS.map(() => '---:').join(' | ')} | --- |`,
  ];
  for (const row of rows) {
    const cells = row.metrics.map(
      (metric) => `${formatPct(metric.current)} / ${formatPct(metric.threshold)}${metric.ok ? '' : ' ✗'}`,
    );
    lines.push(`| \`${row.directory}\` | ${row.files} | ${cells.join(' | ')} | ${row.passed ? 'pass' : 'FAIL'} |`);
  }
  lines.push('', 'Each cell: current / threshold. Threshold = floor(measured on main), never below the global threshold.', '');
  return lines.join('\n');
}

/**
 * @param {Record<string, { total?: number, pct?: number }>} summaryTotal istanbul `total` object
 * @param {Record<string, number>} thresholds
 */
export function evaluateGate(summaryTotal, thresholds) {
  const rows = METRICS.map((metric) => {
    const current = summaryTotal?.[metric];
    const threshold = thresholds[metric];
    const empty = !current || !current.total;
    const pct = empty ? 0 : current.pct;
    const ok = !empty && typeof pct === 'number' && pct >= threshold;
    const delta = empty || typeof pct !== 'number' ? null : Number((pct - threshold).toFixed(2));
    return { metric, current: empty ? null : pct, threshold, delta, ok, empty };
  });
  return { rows, passed: rows.every((row) => row.ok) };
}

function formatPct(value) {
  if (value === null || value === undefined) return '—';
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(2)}%`;
}

function formatDelta(delta) {
  if (delta === null || delta === undefined) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(2)}`;
}

/** Markdown table for GitHub Job Summary: metric, current, threshold, delta. */
export function formatJobSummary(rows, { heading = 'Coverage gate' } = {}) {
  const lines = [
    `## ${heading}`,
    '',
    '| Metric | Current | Threshold | Delta |',
    '| --- | ---: | ---: | ---: |',
  ];
  for (const row of rows) {
    const status = row.ok ? 'pass' : 'FAIL';
    lines.push(
      `| ${row.metric} (${status}) | ${formatPct(row.current)} | ${formatPct(row.threshold)} | ${formatDelta(row.delta)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
