import test from 'node:test';
import assert from 'node:assert/strict';
import {
  directoryThreshold,
  evaluateDirectories,
  evaluateGate,
  floorThreshold,
  formatDirectorySummary,
  formatJobSummary,
  loadThresholds,
} from './coverage-gate.mjs';
import { CONTRACTS_DIR, contractsSources, splitContracts } from './coverage-directories.mjs';

test('floorThreshold floors a measured percent and never goes below 80', () => {
  assert.equal(floorThreshold(92.36), 92);
  assert.equal(floorThreshold(86.13), 86);
  assert.equal(floorThreshold(92.18), 92);
  assert.equal(floorThreshold(93.62), 93);
  assert.equal(floorThreshold(80.9), 80);
  assert.equal(floorThreshold(80), 80);
  assert.equal(floorThreshold(79.9), 80);
  assert.equal(floorThreshold(0), 80);
});

test('checked-in thresholds are max(floor(measured), 80) for main b5a6567', () => {
  const config = loadThresholds();
  assert.equal(config.minimumFloor, 80);
  assert.deepEqual(config.thresholds, {
    statements: 92,
    branches: 86,
    functions: 92,
    lines: 93,
  });
  for (const metric of Object.keys(config.thresholds)) {
    assert.equal(config.thresholds[metric], floorThreshold(config.measured[metric], config.minimumFloor));
  }
});

test('evaluateGate passes when every metric is at or above its threshold', () => {
  const summary = {
    statements: { total: 100, pct: 92.36 },
    branches: { total: 100, pct: 86.13 },
    functions: { total: 100, pct: 92.18 },
    lines: { total: 100, pct: 93.62 },
  };
  const result = evaluateGate(summary, { statements: 92, branches: 86, functions: 92, lines: 93 });
  assert.equal(result.passed, true);
  assert.deepEqual(
    result.rows.map((row) => [row.metric, row.delta, row.ok]),
    [
      ['statements', 0.36, true],
      ['branches', 0.13, true],
      ['functions', 0.18, true],
      ['lines', 0.62, true],
    ],
  );
});

test('evaluateGate fails a metric below threshold and records a negative delta', () => {
  const summary = {
    statements: { total: 100, pct: 92.36 },
    branches: { total: 100, pct: 86.13 },
    functions: { total: 100, pct: 92.18 },
    lines: { total: 100, pct: 93.62 },
  };
  const result = evaluateGate(summary, { statements: 92, branches: 86, functions: 92, lines: 94 });
  assert.equal(result.passed, false);
  const lines = result.rows.find((row) => row.metric === 'lines');
  assert.equal(lines.ok, false);
  assert.equal(lines.delta, -0.38);
  assert.match(formatJobSummary(result.rows), /lines \(FAIL\).*93\.62%.*94%.*-0\.38/);
});

test('evaluateGate fails when a metric has no statements', () => {
  const result = evaluateGate(
    { statements: { total: 0, pct: 100 }, branches: { total: 1, pct: 100 }, functions: { total: 1, pct: 100 }, lines: { total: 1, pct: 100 } },
    { statements: 80, branches: 80, functions: 80, lines: 80 },
  );
  assert.equal(result.passed, false);
  assert.equal(result.rows[0].empty, true);
  assert.equal(result.rows[0].ok, false);
});

const pct = (statements, branches, functions, lines, files = 1) => ({
  files,
  statements: { total: 100, pct: statements },
  branches: { total: 100, pct: branches },
  functions: { total: 100, pct: functions },
  lines: { total: 100, pct: lines },
});

test('#151 directoryThreshold floors the measured value and never goes below the global one', () => {
  assert.equal(directoryThreshold(97.48, 92), 97);
  assert.equal(directoryThreshold(89.5, 86), 89);
  assert.equal(directoryThreshold(100, 93), 100);
  assert.equal(directoryThreshold(85.9, 86), 86);
});

test('#151 checked-in directory thresholds follow the rule, for the three gated trees', () => {
  const config = loadThresholds();
  assert.deepEqual(Object.keys(config.directories), [
    'app/main/src/lifecycle',
    'app/main/src/persistence/okr-store',
    'packages/contracts/src',
  ]);
  for (const [directory, gate] of Object.entries(config.directories)) {
    for (const metric of Object.keys(config.thresholds)) {
      assert.equal(
        gate.thresholds[metric],
        directoryThreshold(gate.measured[metric], config.thresholds[metric]),
        `${directory} ${metric}`,
      );
      assert.ok(gate.thresholds[metric] >= config.thresholds[metric], `${directory} ${metric} ≥ global`);
    }
  }
});

test('#151 evaluateDirectories passes, fails a low metric, and fails a directory with no files', () => {
  const config = {
    directories: {
      a: { thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 } },
      b: { thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 } },
      c: { thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 } },
    },
  };
  const result = evaluateDirectories(
    { a: pct(95, 95, 95, 95, 3), b: pct(95, 89.5, 95, 95, 2), c: pct(100, 100, 100, 100, 0) },
    config,
  );
  assert.equal(result.passed, false);
  assert.deepEqual(
    result.rows.map((row) => [row.directory, row.passed]),
    [
      ['a', true],
      ['b', false],
      ['c', false],
    ],
  );
  assert.deepEqual(result.failed[0].metrics.map((metric) => metric.metric), ['branches']);
  assert.equal(evaluateDirectories(undefined, config).passed, false);
  assert.equal(evaluateDirectories({ a: pct(95, 95, 95, 95) }, { directories: { a: config.directories.a } }).passed, true);
});

test('#151 the Job Summary has one row per directory', () => {
  const config = { directories: { 'x/y': { thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 } } } };
  const markdown = formatDirectorySummary(evaluateDirectories({ 'x/y': pct(91.5, 80, 90, 100, 4) }, config).rows);
  const rows = markdown.split('\n').filter((line) => line.startsWith('| `'));
  assert.equal(rows.length, 1);
  assert.match(rows[0], /\| `x\/y` \| 4 \| 91\.50% \/ 90% \| 80% \/ 90% ✗ \| 90% \/ 90% \| 100% \/ 100%|FAIL/);
  assert.match(rows[0], /FAIL \|$/);
});

test('#151 splitContracts moves only the contracts sources out of a layer report', () => {
  const report = {
    'app/main/src/a.ts': { path: 'app/main/src/a.ts' },
    [`${CONTRACTS_DIR}/b.ts`]: { path: `${CONTRACTS_DIR}/b.ts` },
    'packages/contracts-other/c.ts': { path: 'packages/contracts-other/c.ts' },
  };
  const { product, contracts } = splitContracts(report);
  assert.deepEqual(Object.keys(product), ['app/main/src/a.ts', 'packages/contracts-other/c.ts']);
  assert.deepEqual(Object.keys(contracts), [`${CONTRACTS_DIR}/b.ts`]);
});

test('#151 contractsSources lists the contracts TypeScript sources', () => {
  const files = contractsSources();
  assert.ok(files.some((file) => file.endsWith('/retry.utils.ts')));
  assert.ok(files.every((file) => file.endsWith('.ts') && !file.endsWith('.d.ts')));
});
