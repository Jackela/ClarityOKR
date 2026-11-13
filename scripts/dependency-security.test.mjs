import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('the active Jest micromatch chain resolves published braces 3.0.3, not the retired vendor copy', () => {
  const environment = createRequire(require.resolve('jest-environment-jsdom'));
  const timers = createRequire(environment.resolve('@jest/fake-timers'));
  const messages = createRequire(timers.resolve('jest-message-util'));
  const matching = createRequire(messages.resolve('micromatch'));
  const bracesEntry = matching.resolve('braces');
  const pkg = JSON.parse(readFileSync(join(dirname(bracesEntry), 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'braces');
  assert.equal(pkg.version, '3.0.3');
  assert.doesNotMatch(bracesEntry, /vendor[/\\]braces/);
  assert.deepEqual(messages('micromatch')(['app/main/src/main.ts', 'README.md'], '**/*.{ts,tsx}'), [
    'app/main/src/main.ts',
  ]);
});
