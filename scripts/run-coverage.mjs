import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

for (const directory of [
  'tests/unit/coverage',
  'app/renderer/coverage',
  'tests/integration/coverage',
  'coverage',
]) {
  rmSync(directory, { recursive: true, force: true });
}
const scripts = ['rebuild:node', 'test:unit', 'test:component', 'test:integration'];
if (!process.argv.includes('--collect-only')) {
  scripts.push(
    'build:coverage',
    'rebuild:electron',
    'test:e2e:ci',
    'coverage:remap:e2e',
    'coverage:check',
  );
}
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
