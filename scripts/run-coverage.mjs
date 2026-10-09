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
for (const script of ['test:unit', 'test:component', 'test:integration', 'coverage:check']) {
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', script], {
    stdio: 'inherit',
    env: { ...process.env, COVERAGE: 'true' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
