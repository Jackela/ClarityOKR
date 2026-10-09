/* eslint-disable @typescript-eslint/no-require-imports -- Jest 29 uses synchronous CommonJS transformers. */
const { instrumentSource } = require('./original-source-instrument.cjs');
const helperHash = require('node:crypto')
  .createHash('sha256')
  .update(require('node:fs').readFileSync(require.resolve('./original-source-instrument.cjs')))
  .update(require('node:fs').readFileSync(__filename))
  .digest('hex');
const angular = require('jest-preset-angular').default;
exports.createTransformer = (config) => {
  const { delegatePath, ...delegateConfig } = config;
  const delegate = (delegatePath ? require(delegatePath).default : angular).createTransformer(
    delegateConfig,
  );
  return {
    canInstrument: true,
    process(source, filename, options) {
      const product =
        /\/app\/(?:main|renderer)\/src\/.+\.ts$/.test(filename.replaceAll('\\', '/')) &&
        !/(?:\.(?:spec|test|d)\.ts|\/jest\.setup\.ts|\/test\.ts)$/.test(
          filename.replaceAll('\\', '/'),
        );
      const measured = product && options.instrument;
      const input = measured ? instrumentSource(source, filename).code : source;
      const output = delegate.process(input, filename, { ...options, instrument: false });
      if (measured) {
        output.code = output.code.replace(/\/\/[#@] sourceMappingURL=.*$/gm, '');
        delete output.map;
      }
      return output;
    },
    getCacheKey(source, filename, options) {
      return delegate.getCacheKey(source, filename, options) + helperHash;
    },
  };
};
