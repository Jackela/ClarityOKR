// #44: guards the release setup (run by CI next to test:audit).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const config = require('../electron-builder.config.cjs');
const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const main = JSON.parse(readFileSync(new URL('../app/main/package.json', import.meta.url), 'utf8'));

test('installers carry the version in their names', () => {
  assert.match(config.artifactName, /\$\{version\}/);
  assert.match(config.artifactName, /\$\{os\}-\$\{arch\}/);
});

test('three platforms, native sqlite unpacked from the asar, the Electron version of app/main', () => {
  assert.ok(config.mac && config.win && config.linux);
  assert.ok(config.asarUnpack.some((p) => p.includes('better-sqlite3')));
  assert.equal(config.electronVersion, main.dependencies.electron.replace(/^[^\d]*/, ''));
  assert.equal(config.directories.app, 'build/app');
  assert.equal(config.publish, null);
});

test('package.json packages through the staged app', () => {
  assert.match(root.scripts['build:electron'], /stage-app\.mjs && electron-builder/);
});

test('release.yml: runs on v* tags and by hand, never creates or moves a tag', () => {
  assert.match(workflow, /tags: \['v\*'\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /git tag|git push|create-tag|gh api .*refs/);
  // A missing Release is created only for the tag that already exists.
  assert.match(workflow, /gh release create "\$TAG"[^\n]*--verify-tag/);
});

test('release.yml: adds assets without replacing the Release text; checksums; unsigned note', () => {
  assert.match(workflow, /gh release upload "\$TAG" out\/\* --clobber/);
  assert.match(workflow, /sha256sum .* > SHA256SUMS\.txt/);
  assert.match(workflow, /安装包未签名/);
  assert.match(workflow, /\$\{body\}\$\{note\}/); // appended, never replaced
});

test('signing only through secrets', () => {
  assert.match(workflow, /CSC_LINK: \$\{\{ .*secrets\.MACOS_CERTIFICATE/);
  assert.match(workflow, /WIN_CSC_LINK: \$\{\{ .*secrets\.WINDOWS_CERTIFICATE/);
  assert.doesNotMatch(JSON.stringify(config), /password|certificate/i);
});
