import { readFileSync, writeFileSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { productSourcePaths } from './product-sources.mjs';

const { instrumentSource } = createRequire(import.meta.url)('./original-source-instrument.cjs');
const root = resolve('.');
const hash = (text) => createHash('sha256').update(text).digest('hex');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
const sources = Object.fromEntries(
  productSourcePaths(root).map((file) => [file, hash(readFileSync(file))]),
);
const metadata = {};
function run(args, cwd = root) {
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
    cwd,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Coverage build failed: ${args.join(' ')}`);
}
const temporary = ['app/main/coverage-work', 'app/renderer/coverage-work'];
for (const directory of [
  ...temporary,
  'app/main/dist-coverage',
  'app/renderer/dist-coverage',
  'tests/e2e/coverage',
])
  rmSync(directory, { recursive: true, force: true });
try {
  run(['run', 'build:contracts']);
  for (const owner of ['main', 'renderer']) {
    const work = resolve(`app/${owner}/coverage-work`);
    cpSync(`app/${owner}/src`, join(work, 'src'), { recursive: true });
    for (const file of Object.keys(sources).filter((file) =>
      file.startsWith(resolve(`app/${owner}/src`) + sep),
    )) {
      const result = instrumentSource(readFileSync(file, 'utf8'), file);
      writeFileSync(join(work, relative(resolve(`app/${owner}`), file)), result.code);
      metadata[file] = result.metadata;
    }
    const config = {
      extends: resolve(
        `app/${owner}/${owner === 'main' ? 'tsconfig.build.json' : 'tsconfig.app.json'}`,
      ),
      compilerOptions: {
        baseUrl: work,
        rootDir: join(work, 'src'),
        outDir: resolve(`app/${owner}/dist-coverage`),
        sourceMap: false,
        declarationMap: false,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/jest.setup.ts', 'src/test.ts'],
    };
    if (owner === 'main')
      config.compilerOptions.tsBuildInfoFile = resolve('app/main/dist-coverage/build.tsbuildinfo');
    else config.files = ['src/main.ts'];
    writeFileSync(join(work, 'tsconfig.json'), JSON.stringify(config, null, 2));
  }
  run(['exec', 'tsc', '-p', 'coverage-work/tsconfig.json'], resolve('app/main'));
  run(
    [
      'exec',
      'esbuild',
      'coverage-work/src/bootstrap/preload.ts',
      '--bundle',
      '--platform=browser',
      '--format=cjs',
      '--external:electron',
      '--outfile=dist-coverage/bootstrap/preload.cjs',
    ],
    resolve('app/main'),
  );
  run(
    [
      'exec',
      'ng',
      'build',
      '--browser=coverage-work/src/main.ts',
      '--polyfills=coverage-work/src/polyfills.ts',
      '--ts-config=coverage-work/tsconfig.json',
      '--output-path=dist-coverage',
      '--progress=false',
    ],
    resolve('app/renderer'),
  );
  const outputs = {};
  for (const directory of ['app/main/dist-coverage', 'app/renderer/dist-coverage']) {
    for (const file of files(directory).filter((file) => /\.(?:js|cjs)$/.test(file)))
      outputs[relative(root, file)] = hash(readFileSync(file));
  }
  for (const [file, digest] of Object.entries(sources))
    if (hash(readFileSync(file)) !== digest)
      throw new Error(`Original source changed during build: ${file}`);
  writeFileSync(
    'app/main/dist-coverage/source-manifest.json',
    JSON.stringify(
      { schema: 2, instrumentation: 'original-typescript-ast', sources, metadata, outputs },
      null,
      2,
    ),
  );
  console.log(
    `Original TypeScript coverage build: ${Object.keys(sources).length} complete product sources`,
  );
} finally {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true });
}
