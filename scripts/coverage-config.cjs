// Instrument each product in its real execution layer. The final gate owns the full union.
module.exports = (directory, layer) => ({
  collectCoverage: process.env.COVERAGE === 'true',
  collectCoverageFrom: [
    layer === 'component' ? 'app/renderer/src/**/*.ts' : 'app/main/src/**/*.ts',
    '!**/*.spec.ts',
    '!**/*.test.ts',
    '!**/*.d.ts',
    '!app/renderer/src/jest.setup.ts',
    '!app/renderer/src/test.ts',
  ],
  coverageDirectory: `<rootDir>/${directory}`,
  coverageReporters: ['json', 'text-summary'],
});
