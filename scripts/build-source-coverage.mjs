import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import instrument from 'istanbul-lib-instrument';

const root = resolve('.');
const hash = (text) => createHash('sha256').update(text).digest('hex');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
const sources = Object.fromEntries(
  ['app/main/src', 'app/renderer/src']
    .flatMap(files)
    .filter(
      (file) =>
        file.endsWith('.ts') &&
        !/\.(?:spec|test|d)\.ts$/.test(file) &&
        !['app/renderer/src/jest.setup.ts', 'app/renderer/src/test.ts'].includes(file),
    )
    .map((file) => [resolve(file), hash(readFileSync(file))]),
);
function run(args, cwd = root) {
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
    cwd,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Coverage build failed: ${args.join(' ')}`);
}
for (const directory of [
  'app/main/dist-coverage',
  'app/renderer/dist-coverage',
  'tests/e2e/coverage',
]) {
  rmSync(directory, { recursive: true, force: true });
}
run(['run', 'build:contracts']);
run(
  [
    'exec',
    'tsc',
    '-p',
    'tsconfig.build.json',
    '--sourceMap',
    'true',
    '--inlineSources',
    'true',
    '--outDir',
    'dist-coverage',
    '--tsBuildInfoFile',
    'dist-coverage/build.tsbuildinfo',
  ],
  resolve('app/main'),
);
run(
  [
    'exec',
    'esbuild',
    'src/bootstrap/preload.ts',
    '--bundle',
    '--platform=browser',
    '--format=cjs',
    '--external:electron',
    '--sourcemap',
    '--outfile=dist-coverage/bootstrap/preload.cjs',
  ],
  resolve('app/main'),
);
run(
  [
    'exec',
    'ng',
    'build',
    '--source-map=true',
    '--optimization=false',
    '--output-path=dist-coverage',
    '--progress=false',
  ],
  resolve('app/renderer'),
);
const outputs = {};
for (const directory of ['app/main/dist-coverage', 'app/renderer/dist-coverage']) {
  for (const file of files(directory).filter((file) => /\.(?:js|cjs)$/.test(file))) {
    const mapPath = `${file}.map`;
    let map;
    try {
      map = JSON.parse(readFileSync(mapPath, 'utf8'));
    } catch {
      // Static theme bootstrap has no TypeScript source and no coverage obligation.
      if (file.endsWith('/theme-bootstrap.js')) continue;
      throw new Error(`Missing source map: ${file}`);
    }
    if (!map.sourcesContent || map.sourcesContent.length !== map.sources.length) {
      throw new Error(`Source content missing: ${file}`);
    }
    map.sources = map.sources.map((source, index) => {
      const candidate = resolve(
        file.startsWith('app/renderer/') ? 'app/renderer' : dirname(mapPath),
        map.sourceRoot ?? '',
        source,
      );
      const content = map.sourcesContent[index];
      if (sources[candidate] && hash(content) !== sources[candidate]) {
        throw new Error(`Source map content differs from product source: ${source}`);
      }
      return candidate;
    });
    map.sourceRoot = '';
    const code = readFileSync(file, 'utf8');
    const instrumenter = instrument.createInstrumenter({
      esModules: true,
      coverageGlobalScope: 'globalThis',
      coverageGlobalScopeFunc: false,
      compact: false,
      produceSourceMap: false,
    });
    writeFileSync(file, instrumenter.instrumentSync(code, resolve(file), map));
    outputs[relative(root, file)] = hash(readFileSync(file));
  }
}
writeFileSync(
  'app/main/dist-coverage/source-manifest.json',
  JSON.stringify({ schema: 1, sources, outputs }, null, 2),
);
console.log(`Instrumented coverage build: ${Object.keys(sources).length} complete product sources`);
