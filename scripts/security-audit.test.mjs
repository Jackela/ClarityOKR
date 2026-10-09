import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditSummary } from './security-audit.mjs';

const cleanReport = () => ({
  metadata: { vulnerabilities: { low: 1, moderate: 2, high: 0, critical: 0 } },
  advisories: {},
});

test('permits low and moderate findings but blocks every high or critical finding', () => {
  assert.equal(auditSummary(cleanReport()).status, 'passed');
  for (const severity of ['high', 'critical']) {
    const report = cleanReport();
    report.metadata.vulnerabilities[severity] = 1;
    report.advisories['1'] = { severity, module_name: '@angular/core', title: 'XSS' };
    assert.equal(auditSummary(report).status, 'blocked');
  }
});

test('blocks advisories even if the server reports inconsistent zero totals', () => {
  const report = cleanReport();
  report.advisories['1'] = { severity: 'high', module_name: 'tar', title: 'Path traversal' };
  assert.equal(auditSummary(report).status, 'blocked');
});

test('rejects API errors, missing metadata, strings, and negative counts', () => {
  assert.throws(() => auditSummary({ error: 'registry unavailable' }));
  assert.throws(() => auditSummary({ metadata: cleanReport().metadata }));
  for (const invalidCount of ['0', -1, null, undefined, NaN]) {
    const report = cleanReport();
    report.metadata.vulnerabilities.high = invalidCount;
    assert.throws(() => auditSummary(report));
  }
});
