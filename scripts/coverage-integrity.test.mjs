import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import instrument from 'istanbul-lib-instrument';
import coverage from 'istanbul-lib-coverage';
import {
  productInventory,
  validateLayerCoverage,
  reportFingerprint,
  validateOriginalCoverage,
  originalSourceMetadata,
} from './coverage-integrity.mjs';

const source = `export class NeverImported {
  value: number;
  constructor() { this.value = 1; }
  get answer() { return this.value ?? 0; }
  factory() { return () => this.value; }
}`;
function fixture() {
  const root = mkdtempSync(join(process.cwd(), 'coverage-integrity-fixture-'));
  const reports = {};
  for (const owner of ['main', 'renderer']) {
    const directory = join(root, 'app', owner, 'src');
    mkdirSync(directory, { recursive: true });
    const instrumented = {};
    for (const [name, content] of [
      ['probe.ts', source],
      ['marker.ts', 'export const marker = 1;'],
      ['exports.ts', "export { NeverImported } from './probe.js';"],
    ]) {
      const file = resolve(directory, name);
      writeFileSync(file, content);
      const collector = instrument.createInstrumenter({
        esModules: true,
        parserPlugins: ['typescript'],
      });
      collector.instrumentSync(content, file);
      instrumented[file] = collector.lastFileCoverage();
    }
    reports[owner] = instrumented;
  }
  const inventory = productInventory(root);
  function evidence(layer, report = reports[layer === 'component' ? 'renderer' : 'main']) {
    return {
      schema: 1,
      layer,
      owner: layer === 'component' ? 'renderer' : 'main',
      sources: inventory,
      reportSha256: reportFingerprint(report),
    };
  }
  return {
    root,
    reports,
    inventory,
    evidence,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
function isolated(name, action) {
  test(name, () => {
    const value = fixture();
    try {
      action(value);
    } finally {
      value.cleanup();
    }
  });
}

isolated(
  'unimported constructors, real getters and closures retain genuine zero counters in both products',
  ({ root, reports, inventory, evidence }) => {
    for (const layer of ['unit', 'component', 'integration']) {
      const owner = layer === 'component' ? 'renderer' : 'main';
      const file = resolve(root, `app/${owner}/src/probe.ts`);
      assert.equal(inventory[file].functions, 4);
      assert.deepEqual(Object.values(reports[owner][file].f), [0, 0, 0, 0]);
      validateLayerCoverage(layer, reports[owner], evidence(layer), inventory, root);
    }
  },
);
isolated(
  'pure source reexports have zero functions while remaining in the source inventory',
  ({ root, reports, inventory, evidence }) => {
    const file = resolve(root, 'app/main/src/exports.ts');
    assert.equal(inventory[file].functions, 0);
    assert.equal(inventory[file].requiresCounters, false);
    delete reports.main[file];
    validateLayerCoverage('unit', reports.main, evidence('unit'), inventory, root);
    assert.ok(inventory[file].sha256);
  },
);
isolated(
  'missing unimported executable product files cannot disappear from coverage',
  ({ root, reports, inventory, evidence }) => {
    delete reports.main[resolve(root, 'app/main/src/probe.ts')];
    assert.throws(
      () => validateLayerCoverage('unit', reports.main, evidence('unit'), inventory, root),
      /Executable product source missing/,
    );
  },
);
isolated(
  'a collector cannot swallow an actual constructor, getter or closure',
  ({ root, reports, inventory, evidence }) => {
    const file = resolve(root, 'app/main/src/probe.ts');
    reports.main[file].fnMap = {};
    reports.main[file].f = {};
    assert.throws(
      () => validateLayerCoverage('unit', reports.main, evidence('unit'), inventory, root),
      /Real source functions not instrumented/,
    );
  },
);
isolated(
  'cross-layer compiler scope and falsely declared ownership both fail',
  ({ root, reports, inventory, evidence }) => {
    assert.throws(
      () =>
        validateLayerCoverage(
          'unit',
          reports.renderer,
          evidence('unit', reports.renderer),
          inventory,
          root,
        ),
      /Wrong source scope/,
    );
    const invalid = { ...evidence('unit'), owner: 'renderer' };
    assert.throws(
      () => validateLayerCoverage('unit', reports.main, invalid, inventory, root),
      /Invalid coverage scope/,
    );
  },
);
isolated(
  'changed source bytes and omitted inventory entries fail even when counters exist',
  ({ root, reports, inventory, evidence }) => {
    const saved = evidence('unit');
    writeFileSync(resolve(root, 'app/main/src/probe.ts'), source + '\nexport const added = 1;');
    assert.throws(
      () => validateLayerCoverage('unit', reports.main, saved, productInventory(root), root),
      /Stale or incomplete/,
    );
    const incomplete = { ...saved, sources: { ...inventory } };
    delete incomplete.sources[resolve(root, 'app/renderer/src/probe.ts')];
    assert.throws(
      () => validateLayerCoverage('unit', reports.main, incomplete, inventory, root),
      /Stale or incomplete/,
    );
  },
);
isolated(
  'changed report counters and inconsistent source paths fail',
  ({ root, reports, inventory, evidence }) => {
    const saved = evidence('unit');
    const file = resolve(root, 'app/main/src/probe.ts');
    reports.main[file].f[0] = 1;
    assert.throws(
      () => validateLayerCoverage('unit', reports.main, saved, inventory, root),
      /report changed/,
    );
    reports.main[file].path = resolve(root, 'app/renderer/src/probe.ts');
    assert.throws(
      () => validateLayerCoverage('unit', reports.main, evidence('unit'), inventory, root),
      /Inconsistent coverage source path/,
    );
  },
);

isolated(
  'layer reports cannot suppress real branches or add compiler functions even with fresh fingerprints',
  ({ root, reports, inventory, evidence }) => {
    const file = resolve(root, 'app/main/src/probe.ts');
    const original = structuredClone(reports.main[file]);
    delete reports.main[file].branchMap[0];
    delete reports.main[file].b[0];
    assert.throws(
      () => validateLayerCoverage('unit', reports.main, evidence('unit'), inventory, root),
      /Original coverage metadata changed/,
    );
    reports.main[file] = original;
    reports.main[file].fnMap.generated = {
      name: 'compiled',
      decl: original.fnMap[0].decl,
      loc: original.fnMap[0].loc,
      line: 2,
    };
    reports.main[file].f.generated = 0;
    assert.throws(
      () => validateLayerCoverage('unit', reports.main, evidence('unit'), inventory, root),
      /Original coverage metadata changed/,
    );
  },
);

isolated(
  'final merged candidate rejects missing real branches and phantom compiler functions against fresh full metadata',
  ({ root, reports, inventory }) => {
    const merged = coverage.createCoverageMap(reports.main);
    merged.merge(reports.renderer);
    const original = originalSourceMetadata(inventory);
    const candidate = JSON.parse(JSON.stringify(merged.toJSON()));
    validateOriginalCoverage(candidate, original);
    const file = resolve(root, 'app/main/src/probe.ts');
    const missing = structuredClone(candidate);
    delete missing[file].branchMap[0];
    delete missing[file].b[0];
    assert.throws(
      () => validateOriginalCoverage(missing, original),
      /Original coverage metadata changed/,
    );
    const phantom = structuredClone(candidate);
    phantom[file].fnMap.generated = {
      name: 'compiled',
      decl: original[file].fnMap[0].decl,
      loc: original[file].fnMap[0].loc,
      line: 2,
    };
    phantom[file].f.generated = 0;
    assert.throws(
      () => validateOriginalCoverage(phantom, original),
      /Original coverage metadata changed/,
    );
  },
);
