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

// #183: a dry run may build a branch / commit (`ref`), but the real-release path is unchanged.
const job = (name) => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `job ${name}`);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z][\w-]*:\n/);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
};
const step = (body, name) => {
  const start = body.indexOf(`- name: ${name}\n`);
  assert.ok(start >= 0, `step ${name}`);
  const next = body.slice(start + 1).search(/\n {6}- (name|uses):/);
  return next < 0 ? body.slice(start) : body.slice(start, start + 1 + next);
};

test('release.yml #183: `ref` is read only from workflow_dispatch; tag pushes check out refs/tags/<tag>', () => {
  assert.match(
    workflow,
    /\n {2}DRY_RUN_REF: \$\{\{ github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.ref \|\| '' \}\}\n/,
  );
  // empty DRY_RUN_REF (every tag push, every dispatch without ref) → exactly the old checkout
  assert.match(
    step(job('build'), 'Checkout the tag (or the dry-run ref)'),
    /\n {10}ref: \$\{\{ env\.DRY_RUN_REF != '' && env\.DRY_RUN_REF \|\| format\('refs\/tags\/\{0\}', env\.TAG\) \}\}\n/,
  );
  assert.match(
    workflow,
    /\n {2}TAG: \$\{\{ github\.event\.inputs\.tag \|\| github\.ref_name \}\}\n/,
  );
  assert.match(workflow, /\n {6}tag:\n {8}description: [^\n]+\n {8}required: true\n/);
});

test('release.yml #183: a dry-run ref refuses upload before building, and the Attach job refuses it too', () => {
  const build = job('build');
  const guard = step(build, 'Dry-run ref only without upload');
  assert.match(guard, /if: env\.DRY_RUN_REF != ''/);
  assert.match(guard, /UPLOAD_INPUT: \$\{\{ github\.event\.inputs\.upload \}\}/);
  assert.match(guard, /if \[ "\$UPLOAD_INPUT" != "false" \]; then[\s\S]*?exit 1/);
  assert.ok(
    build.indexOf('Dry-run ref only without upload') < build.indexOf('Checkout the tag'),
    'the guard runs before anything is checked out',
  );
  const release = job('release');
  assert.match(
    step(release, 'No upload from a dry-run ref'),
    /if: env\.DRY_RUN_REF != ''[\s\S]*exit 1/,
  );
});

test('release.yml #183: real-release checks stay as strict as before', () => {
  const build = job('build');
  // version check: unconditional, compares package.json with the tag input
  const versionCheck = step(build, 'The tag matches package.json');
  assert.doesNotMatch(versionCheck, /\n {8}if:/);
  assert.match(versionCheck, /if \[ "v\$\{version\}" != "\$\{TAG\}" \]; then[\s\S]*exit 1/);
  // a real release still fails without the Windows toolchain script
  assert.match(
    step(build, 'Setup Windows build environment (missing script)'),
    /RELEASE_UPLOAD: \$\{\{ github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.upload == 'false' && 'false' \|\| 'true' \}\}[\s\S]*exit 1/,
  );
  // Attach runs on a tag push or upload=true only, needs every build, uploads to the tag
  const release = job('release');
  assert.match(release, /\n {4}needs: build\n/);
  assert.match(
    release,
    /\n {4}if: github\.event_name == 'push' \|\| github\.event\.inputs\.upload == 'true'\n/,
  );
  assert.match(step(release, 'Checksums'), /sha256sum \$files > SHA256SUMS\.txt/);
  assert.match(workflow, /if-no-files-found: error/);
});
