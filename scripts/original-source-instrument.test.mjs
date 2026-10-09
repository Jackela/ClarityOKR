import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import instrument from 'istanbul-lib-instrument';
import { validateOriginalCoverage } from './coverage-integrity.mjs';
const { instrumentSource } = createRequire(import.meta.url)('./original-source-instrument.cjs');

function execute(source, filename = '/actual/product/probe.ts') {
  const value = instrumentSource(source, filename);
  const context = { exports: {} };
  try {
    vm.runInNewContext(
      ts.transpileModule(value.code, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      context,
    );
  } catch (error) {
    context.error = error;
  }
  return { ...value, context, filename };
}

test('original TS metadata retains optional/nullish branches and never-called constructor/getter/closure', () => {
  const source = `export class NeverImported {
    constructor(readonly value?: number) {}
    get answer() { return this.value ?? 0; }
    factory() { return () => this.value?.toString(); }
  }`;
  const value = execute(source);
  const oracle = instrument.createInstrumenter({
    esModules: true,
    parserPlugins: ['typescript', 'decorators-legacy'],
  });
  oracle.instrumentSync(source, value.filename);
  for (const key of ['statementMap', 'fnMap', 'branchMap'])
    assert.deepEqual(value.metadata[key], oracle.lastFileCoverage()[key]);
  assert.ok(Object.values(value.metadata.f).length >= 4);
  const report = value.context.__coverage__;
  assert.ok(Object.values(report[value.filename].f).every((hit) => hit === 0));
  assert.ok(
    Object.values(report[value.filename].b)
      .flat()
      .every((hit) => hit === 0),
  );
  validateOriginalCoverage(report, { [value.filename]: value.metadata });
});

test('top-level static values remain static, while a failed multiple initializer leaves later statement unhit', () => {
  const value = execute(
    "function fail() { throw new Error('expected'); }\nexport const a=fail(), b=2;",
  );
  assert.equal(value.context.error?.message, 'expected');
  const report = value.context.__coverage__[value.filename];
  const second = Object.entries(report.statementMap).find(
    ([, loc]) => loc.start.line === 2 && loc.start.column === 25,
  )?.[0];
  assert.ok(second);
  assert.equal(report.s[second], 0);
  const staticValue = instrumentSource(
    'export const styles = `body { color: red; }`;',
    '/actual/product/style.ts',
  );
  const tree = ts.createSourceFile('style.ts', staticValue.code, ts.ScriptTarget.Latest, true);
  const variable = tree.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations[0].name.getText(tree) === 'styles',
  );
  assert.ok(
    ts.isNoSubstitutionTemplateLiteral(variable.declarationList.declarations[0].initializer),
  );
  assert.equal(Object.keys(staticValue.metadata.s).length, 1);
});

test('strict original parameter override and Angular decorators survive instrumentation', () => {
  const value = instrumentSource(
    "@Injectable({providedIn: 'root'})\nexport class Service extends Error {\n constructor(message: string, override readonly cause?: unknown) { super(message); }\n}",
    '/actual/product/service.ts',
  );
  const tree = ts.createSourceFile('service.ts', value.code, ts.ScriptTarget.Latest, true);
  const klass = tree.statements.find(ts.isClassDeclaration);
  assert.equal(ts.getDecorators(klass).length, 1);
  assert.ok(
    klass.members
      .find(ts.isConstructorDeclaration)
      .parameters[1].modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.OverrideKeyword),
  );
  assert.ok(!/new Function\(|eval\(/.test(value.code));
});

test('original execution metadata rejects suppressed branches, missing counters and impossible hits', () => {
  const value = execute('export function branch(value: boolean) { return value ? 1 : 2; }');
  const report = value.context.__coverage__;
  const original = { [value.filename]: value.metadata };
  validateOriginalCoverage(report, original);
  const suppressed = structuredClone(report);
  delete suppressed[value.filename].branchMap[0];
  assert.throws(() => validateOriginalCoverage(suppressed, original), /metadata changed/);
  const missing = structuredClone(report);
  delete missing[value.filename].b[0];
  assert.throws(() => validateOriginalCoverage(missing, original), /counter inventory changed/);
  const impossible = structuredClone(report);
  impossible[value.filename].b[0][0] = -1;
  assert.throws(
    () => validateOriginalCoverage(impossible, original),
    /Invalid original execution counter/,
  );
});

test('actual Electron collector fingerprints immutable zero metadata separately from real execution hits', () => {
  const root = mkdtempSync(join(process.cwd(), 'coverage-collector-fixture-'));
  const put = (file, value) => {
    const full = join(root, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  try {
    const source = 'export function mark() { return 1; }';
    const metadata = {},
      sources = {},
      worlds = {};
    for (const [world, relative] of [
      ['main', 'app/main/src/main.ts'],
      ['preload', 'app/main/src/bootstrap/preload.ts'],
      ['renderer', 'app/renderer/src/main.ts'],
    ]) {
      const file = join(root, relative);
      put(relative, source);
      const value = execute(source, file);
      value.context.exports.mark();
      metadata[file] = value.metadata;
      sources[file] = hash(source);
      worlds[world] = JSON.parse(JSON.stringify(value.context.__coverage__));
    }
    put('app/main/dist-coverage/source-manifest.json', {
      schema: 2,
      instrumentation: 'original-typescript-ast',
      sources,
      metadata,
      outputs: {},
    });
    put('tests/e2e/test-results/actual/source-coverage.json', {
      main: worlds.main,
      windows: [{ renderer: worlds.renderer, preload: worlds.preload }],
    });
    put('tests/e2e/coverage/playwright-results.json', {
      stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0 },
      errors: [],
    });
    const result = spawnSync(process.execPath, [resolve('scripts/remap-source-coverage.mjs')], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const evidence = JSON.parse(readFileSync(join(root, 'tests/e2e/coverage/evidence.json')));
    const report = JSON.parse(readFileSync(join(root, 'tests/e2e/coverage/coverage-final.json')));
    assert.equal(evidence.metadataSha256, hash(JSON.stringify(metadata)));
    assert.equal(evidence.reportSha256, hash(JSON.stringify(report)));
    assert.notEqual(evidence.metadataSha256, evidence.reportSha256);
    assert.ok(Object.values(report).every((file) => Object.values(file.f).some((hit) => hit > 0)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
