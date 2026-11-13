import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the lockfile does not reintroduce a vendor braces patch; any braces is published 3.0.3', () => {
  const lock = readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
  assert.doesNotMatch(lock, /file:vendor[/\\]braces/);
  assert.doesNotMatch(lock, /vendor[/\\]braces/);
  const versions = [...lock.matchAll(/^ {2}braces@([^:]+):/gm)].map((m) => m[1]);
  for (const version of versions) {
    assert.equal(version, '3.0.3');
  }
});

test('if a Jest micromatch chain is still installed, it resolves published braces 3.0.3', () => {
  const environment = createRequire(require.resolve('jest-environment-jsdom'));
  const timers = createRequire(environment.resolve('@jest/fake-timers'));
  const messages = createRequire(timers.resolve('jest-message-util'));
  let micromatchEntry;
  try {
    micromatchEntry = messages.resolve('micromatch');
  } catch (error) {
    // Jest 30's jest-message-util / @jest/transform use picomatch, not micromatch.
    // After the Angular 22 lockfile refresh, ts-jest resolves @jest/transform@30
    // and the historical micromatch → braces chain is no longer in the tree.
    assert.equal(error.code, 'MODULE_NOT_FOUND');
    assert.match(String(error), /micromatch/);
    return;
  }
  const matching = createRequire(micromatchEntry);
  const bracesEntry = matching.resolve('braces');
  const pkg = JSON.parse(readFileSync(join(dirname(bracesEntry), 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'braces');
  assert.equal(pkg.version, '3.0.3');
  assert.doesNotMatch(bracesEntry, /vendor[/\\]braces/);
  const micromatch = matching(micromatchEntry);
  assert.deepEqual(micromatch(['app/main/src/main.ts', 'README.md'], '**/*.{ts,tsx}'), [
    'app/main/src/main.ts',
  ]);
});
