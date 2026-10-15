#!/usr/bin/env node
// Makes sure better-sqlite3 is built for the runtime about to use it (#55).
//   node scripts/ensure-native.mjs node      -> unit / integration (plain Node)
//   node scripts/ensure-native.mjs electron  -> e2e (Electron)
// It loads the module in that runtime first and only rebuilds when loading fails, so switching
// between `pnpm run test:unit` and `pnpm run test:e2e` no longer needs a manual rebuild.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (target !== 'node' && target !== 'electron') {
  console.error('usage: ensure-native.mjs <node|electron>');
  process.exit(2);
}

const probe = "new (require('better-sqlite3'))(':memory:').close()";
const mainDir = join(ROOT, 'app/main');

function loads() {
  if (target === 'node') {
    return spawnSync(process.execPath, ['-e', probe], { cwd: mainDir }).status === 0;
  }
  const electron = createRequire(join(mainDir, 'package.json'))('electron');
  return (
    spawnSync(electron, ['-e', probe], {
      cwd: mainDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    }).status === 0
  );
}

if (loads()) {
  console.log(`[ensure-native] better-sqlite3 already built for ${target}`);
  process.exit(0);
}
console.log(`[ensure-native] rebuilding better-sqlite3 for ${target}…`);
const run = spawnSync('pnpm', ['run', target === 'node' ? 'rebuild:node' : 'rebuild:electron'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (run.status !== 0 || !loads()) {
  console.error(`[ensure-native] better-sqlite3 still does not load in ${target}`);
  process.exit(1);
}
