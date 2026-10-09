import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import coverage from 'istanbul-lib-coverage';
import reporting from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import { createHash } from 'node:crypto';
import { productSourcePaths } from './product-sources.mjs';
import {
  productInventory,
  validateLayerCoverage,
  reportFingerprint,
  validateOriginalCoverage,
  originalSourceMetadata,
} from './coverage-integrity.mjs';

if (process.env.E2E_COVERAGE === 'true') {
  const evidence = JSON.parse(readFileSync('tests/e2e/coverage/evidence.json', 'utf8'));
  const report = JSON.parse(readFileSync('tests/e2e/coverage/coverage-final.json', 'utf8'));
  const manifest = JSON.parse(readFileSync('app/main/dist-coverage/source-manifest.json', 'utf8'));
  if (
    evidence.schema !== 2 ||
    evidence.instrumentation !== 'original-typescript-ast' ||
    evidence.reportSha256 !== reportFingerprint(report) ||
    evidence.metadataSha256 !== reportFingerprint(manifest.metadata)
  )
    throw new Error('Changed original Electron coverage report or metadata');
  validateOriginalCoverage(report, manifest.metadata);
  if (
    !evidence.captures ||
    JSON.stringify(productSourcePaths()) !== JSON.stringify(Object.keys(evidence.sources).sort())
  )
    throw new Error('E2E coverage must match the complete current product source collection');
  for (const [file, digest] of Object.entries(evidence.sources)) {
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== digest)
      throw new Error(`Stale E2E source coverage: ${file}`);
  }
}

const inventory = productInventory();
const merged = coverage.createCoverageMap({});
for (const directory of [
  'tests/unit',
  'app/renderer',
  'tests/integration',
  ...(process.env.E2E_COVERAGE === 'true' ? ['tests/e2e'] : []),
]) {
  const input = JSON.parse(
    readFileSync(resolve(directory, 'coverage/coverage-final.json'), 'utf8'),
  );
  if (!Object.keys(input).length) throw new Error(`Empty coverage report: ${directory}`);
  const layer = {
    'tests/unit': 'unit',
    'app/renderer': 'component',
    'tests/integration': 'integration',
  }[directory];
  if (layer) {
    const evidence = JSON.parse(readFileSync(resolve(directory, 'coverage/evidence.json'), 'utf8'));
    validateLayerCoverage(layer, input, evidence, inventory);
  }
  merged.merge(input);
}
const finalReport = merged.toJSON();
if (
  process.env.E2E_COVERAGE === 'true' &&
  JSON.stringify(merged.files().sort()) !== JSON.stringify(productSourcePaths())
)
  throw new Error(
    'Final merged coverage must retain every original product source, including type-only and export-only files',
  );
validateOriginalCoverage(finalReport, originalSourceMetadata(inventory));
const summary = merged.getCoverageSummary().toJSON();
mkdirSync('coverage', { recursive: true });
writeFileSync('coverage/source-inventory.json', JSON.stringify(inventory, null, 2));
writeFileSync('coverage/coverage-final.json', JSON.stringify(finalReport));
writeFileSync('coverage/coverage-summary.json', JSON.stringify({ total: summary }, null, 2));
const context = reporting.createContext({ dir: 'coverage', coverageMap: merged });
for (const format of ['text-summary', 'lcov', 'html']) reports.create(format).execute(context);
const failed = ['lines', 'statements', 'functions', 'branches']
  .map((name) => [name, summary[name]])
  .filter(([, metric]) => metric.total === 0 || metric.pct < 80);
if (failed.length) {
  console.error(JSON.stringify({ gate: 'coverage', minimum: 80, failed }, null, 2));
  process.exitCode = 1;
}
