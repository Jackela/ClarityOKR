import { readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Must match scripts/coverage-config.cjs: every product TS source, only test/type entries omitted.
export function productSourcePaths(root = '.') {
  function files(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
    );
  }
  return ['app/main/src', 'app/renderer/src']
    .flatMap((directory) => files(resolve(root, directory)))
    .filter(
      (file) =>
        file.endsWith('.ts') &&
        !/\.(?:spec|test|d)\.ts$/.test(file) &&
        ![
          resolve(root, 'app/renderer/src/jest.setup.ts'),
          resolve(root, 'app/renderer/src/test.ts'),
        ].includes(file),
    )
    .sort();
}
