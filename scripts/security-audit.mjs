import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Validate pnpm 9's audit report. Missing or malformed data must never pass. */
export function auditSummary(report) {
  const vulnerabilities = report?.metadata?.vulnerabilities;
  if (!vulnerabilities || !report.advisories || typeof report.advisories !== 'object') {
    throw new Error('Audit response is missing vulnerability metadata or advisories');
  }
  for (const severity of ['low', 'moderate', 'high', 'critical']) {
    if (!Number.isSafeInteger(vulnerabilities[severity]) || vulnerabilities[severity] < 0) {
      throw new Error(`Invalid audit count: ${severity}`);
    }
  }
  const blockers = Object.values(report.advisories)
    .filter((advisory) => ['high', 'critical'].includes(advisory.severity))
    .map((advisory) => ({
      package: advisory.module_name,
      severity: advisory.severity,
      title: advisory.title,
      patchedVersions: advisory.patched_versions,
      url: advisory.url,
    }));
  return {
    status:
      vulnerabilities.high === 0 && vulnerabilities.critical === 0 && blockers.length === 0
        ? 'passed'
        : 'blocked',
    vulnerabilities,
    blockers,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const audit = spawnSync('pnpm', ['audit', '--json'], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 240_000,
      shell: process.platform === 'win32',
    });
    if (audit.error) throw audit.error;
    if (audit.status !== 0 && audit.status !== 1) {
      throw new Error(`Audit command failed (exit ${audit.status})`);
    }
    writeFileSync('audit-report.json', audit.stdout);
    const summary = auditSummary(JSON.parse(audit.stdout));
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = summary.status === 'passed' ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'error', message: error.message }));
    process.exitCode = 1;
  }
}
