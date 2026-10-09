import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import coverage from 'istanbul-lib-coverage';
import sourceMaps from 'istanbul-lib-source-maps';

const manifest = JSON.parse(readFileSync('app/main/dist-coverage/source-manifest.json', 'utf8'));
const hash = (text) => createHash('sha256').update(text).digest('hex');
for (const [file, digest] of Object.entries(manifest.sources)) {
  if (hash(readFileSync(file)) !== digest)
    throw new Error(`Product source changed since E2E build: ${file}`);
}
for (const [file, digest] of Object.entries(manifest.outputs)) {
  if (hash(readFileSync(file)) !== digest) throw new Error(`Instrumented output changed: ${file}`);
}
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
const inputs = files('tests/e2e/test-results').filter((file) =>
  file.endsWith('/source-coverage.json'),
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
) {
  throw new Error(
    `Require coverage from every passing E2E with zero skipped, failed or retried tests: ${JSON.stringify(stats)}`,
  );
}
const raw = coverage.createCoverageMap({});
for (const file of inputs) {
  const { main, windows } = JSON.parse(readFileSync(file, 'utf8'));
  raw.merge(main);
  for (const window of windows) {
    raw.merge(window.renderer);
    raw.merge(window.preload);
  }
}
const mapped = await sourceMaps.createSourceMapStore().transformCoverage(raw);
const product = coverage.createCoverageMap({});
for (const file of mapped.files()) {
  if (manifest.sources[resolve(file)]) product.addFileCoverage(mapped.fileCoverageFor(file));
}
if (
  !product.files().some((file) => file.includes('/app/main/src/')) ||
  !product.files().some((file) => file.includes('/app/renderer/src/')) ||
  !product.files().some((file) => file.endsWith('/bootstrap/preload.ts'))
) {
  throw new Error('Source remapping did not recover actual main, renderer, and preload TypeScript');
}
mkdirSync('tests/e2e/coverage', { recursive: true });
writeFileSync('tests/e2e/coverage/coverage-final.json', JSON.stringify(product.toJSON()));
writeFileSync(
  'tests/e2e/coverage/evidence.json',
  JSON.stringify(
    {
      schema: 1,
      captures: inputs.length,
      mappedProductFiles: product.files(),
      sources: manifest.sources,
    },
    null,
    2,
  ),
);
console.log(
  `Mapped ${inputs.length} real Electron executions to ${product.files().length} product TypeScript sources`,
);
