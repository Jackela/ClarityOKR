import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import coverage from 'istanbul-lib-coverage';
import { productSourcePaths } from './product-sources.mjs';
import { validateOriginalCoverage, reportFingerprint } from './coverage-integrity.mjs';

const manifest = JSON.parse(readFileSync('app/main/dist-coverage/source-manifest.json', 'utf8'));
if (manifest.schema !== 2 || manifest.instrumentation !== 'original-typescript-ast')
  throw new Error('Require original TypeScript AST coverage build');
if (
  JSON.stringify(productSourcePaths()) !== JSON.stringify(Object.keys(manifest.sources).sort()) ||
  JSON.stringify(Object.keys(manifest.metadata).sort()) !==
    JSON.stringify(Object.keys(manifest.sources).sort())
)
  throw new Error('Product source collection changed since E2E build');
const hash = (text) => createHash('sha256').update(text).digest('hex');
for (const [file, digest] of Object.entries(manifest.sources))
  if (hash(readFileSync(file)) !== digest)
    throw new Error(`Product source changed since E2E build: ${file}`);
for (const [file, digest] of Object.entries(manifest.outputs))
  if (hash(readFileSync(file)) !== digest) throw new Error(`Instrumented output changed: ${file}`);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
const inputs = files('tests/e2e/test-results').filter(
  (file) => file.endsWith('/source-coverage.json') || file.endsWith('\\source-coverage.json'),
);
const { stats, errors } = JSON.parse(
  readFileSync('tests/e2e/coverage/playwright-results.json', 'utf8'),
);
if (
  errors.length ||
  stats.unexpected ||
  stats.skipped ||
  stats.flaky ||
  !stats.expected ||
  inputs.length !== stats.expected
)
  throw new Error(
    `Require coverage from every passing E2E with zero skipped, failed or retried tests: ${JSON.stringify(stats)}`,
  );
const product = coverage.createCoverageMap(structuredClone(manifest.metadata));
const capturedProductFiles = new Set();
for (const file of inputs) {
  const { main, windows } = JSON.parse(readFileSync(file, 'utf8'));
  if (!main || !Object.keys(main).length || !windows?.length)
    throw new Error(`Incomplete Electron capture: ${file}`);
  for (const report of [main, ...windows.flatMap((window) => [window.renderer, window.preload])]) {
    if (!report || !Object.keys(report).length)
      throw new Error(`Missing Electron execution world: ${file}`);
    validateOriginalCoverage(report, manifest.metadata);
    Object.keys(report).forEach((file) => capturedProductFiles.add(file));
    product.merge(report);
  }
}
const report = product.toJSON();
validateOriginalCoverage(report, manifest.metadata);
mkdirSync('tests/e2e/coverage', { recursive: true });
writeFileSync('tests/e2e/coverage/coverage-final.json', JSON.stringify(report));
writeFileSync(
  'tests/e2e/coverage/evidence.json',
  JSON.stringify(
    {
      schema: 2,
      instrumentation: manifest.instrumentation,
      captures: inputs.length,
      inventoryProductFiles: product.files(),
      capturedProductFiles: [...capturedProductFiles].sort(),
      sources: manifest.sources,
      metadataSha256: reportFingerprint(manifest.metadata),
      reportSha256: reportFingerprint(report),
    },
    null,
    2,
  ),
);
console.log(
  `Collected ${inputs.length} real Electron executions over ${product.files().length} complete original TypeScript sources`,
);
