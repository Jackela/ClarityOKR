import { rmSync, readFileSync, writeFileSync } from 'node:fs';
import {
  productInventory,
  validateLayerCoverage,
  layerOwners,
  reportFingerprint,
} from './coverage-integrity.mjs';
import { spawnSync } from 'node:child_process';

for (const directory of [
  'tests/unit/coverage',
  'app/renderer/coverage',
  'tests/integration/coverage',
  'coverage',
]) {
  rmSync(directory, { recursive: true, force: true });
}
const scripts = [
  'test:coverage-integrity',
  'rebuild:node',
  'test:unit',
  'test:component',
  'test:integration',
];
if (!process.argv.includes('--collect-only')) {
  scripts.push(
    'build:coverage',
    'rebuild:electron',
    'test:e2e:ci',
    'coverage:remap:e2e',
    'coverage:check',
  );
}
const sourceInventory = productInventory();
let electronRebuilt = false;
for (const script of scripts) {
  if (script === 'rebuild:electron') electronRebuilt = true;
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', script], {
    stdio: 'inherit',
    env: { ...process.env, COVERAGE: 'true', E2E_COVERAGE: 'true' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
  const layer = {
    'test:unit': 'unit',
    'test:component': 'component',
    'test:integration': 'integration',
  }[script];
  if (layer) {
    const directory = {
      unit: 'tests/unit',
      component: 'app/renderer',
      integration: 'tests/integration',
    }[layer];
    const report = JSON.parse(readFileSync(`${directory}/coverage/coverage-final.json`, 'utf8'));
    const evidence = {
      schema: 1,
      layer,
      owner: layerOwners[layer],
      sources: sourceInventory,
      reportSha256: reportFingerprint(report),
    };
    validateLayerCoverage(layer, report, evidence, productInventory());
    writeFileSync(`${directory}/coverage/evidence.json`, JSON.stringify(evidence, null, 2));
  }
}
if (electronRebuilt) {
  const result = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['run', 'rebuild:node'],
    {
      stdio: 'inherit',
      env: process.env,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}
