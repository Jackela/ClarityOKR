#!/usr/bin/env node
// #44: lays out what goes into the installer under build/app, so electron-builder packages a plain
// npm-style app instead of the pnpm workspace:
//   build/app/package.json            name / version / main, production deps of app/main
//   build/app/app/main/dist/**        main process (same relative layout as in the repo, so the
//   build/app/app/renderer/dist/**    renderer path in main.ts, ../../renderer/dist, still works)
//   build/app/node_modules/**         npm install --omit=dev, plus @clarityokr/contracts (built)
// electron-builder then rebuilds better-sqlite3 for Electron (npmRebuild).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build/app');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

for (const required of [
  'app/main/dist/main.js',
  'app/renderer/dist/index.html',
  'packages/contracts/dist/index.js',
]) {
  if (!existsSync(join(ROOT, required))) {
    console.error(`[stage-app] missing ${required}; run pnpm run build first`);
    process.exit(1);
  }
}

const root = read('package.json');
const main = read('app/main/package.json');
const contracts = read('packages/contracts/package.json');
const electronVersion = main.dependencies.electron;

// Runtime dependencies only: electron is provided by the runtime; contracts (a workspace
// package) is installed from a tarball, so it lands in node_modules as a real dependency that
// electron-builder collects.
const contractsTarball = `clarityokr-contracts-${contracts.version}.tgz`;
const dependencies = Object.fromEntries(
  Object.entries({ ...contracts.dependencies, ...main.dependencies }).filter(
    ([name]) => name !== 'electron' && !name.startsWith('@clarityokr/'),
  ),
);
dependencies['@clarityokr/contracts'] = `file:./${contractsTarball}`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, 'package.json'),
  `${JSON.stringify(
    {
      name: 'clarityokr',
      productName: 'ClarityOKR',
      version: root.version,
      description: 'ClarityOKR — OKR 便签',
      author: root.author,
      license: root.license,
      type: 'module',
      main: 'app/main/dist/main.js',
      dependencies,
      devDependencies: { electron: electronVersion },
    },
    null,
    2,
  )}\n`,
);
cpSync(join(ROOT, 'app/main/dist'), join(OUT, 'app/main/dist'), { recursive: true });
cpSync(join(ROOT, 'app/renderer/dist'), join(OUT, 'app/renderer/dist'), { recursive: true });
// main.ts reads ../package.json (app/main/package.json) for the version when not packaged; keep it.
writeFileSync(
  join(OUT, 'app/main/package.json'),
  `${JSON.stringify({ name: '@clarityokr/main', version: root.version, type: 'module' }, null, 2)}\n`,
);

const pack = spawnSync('npm', ['pack', '--pack-destination', OUT], {
  cwd: join(ROOT, 'packages/contracts'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (pack.status !== 0) process.exit(pack.status ?? 1);

const npm = spawnSync(
  'npm',
  ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'],
  {
    cwd: OUT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);
if (npm.status !== 0) process.exit(npm.status ?? 1);

console.log(`[stage-app] staged ${root.version} into build/app`);
