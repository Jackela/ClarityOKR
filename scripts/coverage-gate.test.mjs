import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateGate,
  floorThreshold,
  formatJobSummary,
  loadThresholds,
} from './coverage-gate.mjs';

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
