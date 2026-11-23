// Instrument each product in its real execution layer. The final gate owns the full union.
module.exports = (directory, layer) => ({
  collectCoverage: process.env.COVERAGE === 'true',
  collectCoverageFrom: [
    layer === 'component' ? 'app/renderer/src/**/*.ts' : 'app/main/src/**/*.ts',
    // #151: every layer also measures the shared contracts it imports. run-coverage.mjs moves
    // these entries to contracts-coverage-final.json so the layer report keeps its product scope.
    'packages/contracts/src/**/*.ts',
    '!**/*.spec.ts',
    '!**/*.test.ts',
    '!**/*.d.ts',
    '!app/renderer/src/jest.setup.ts',
    '!app/renderer/src/test.ts',
  ],
  coverageDirectory: `<rootDir>/${directory}`,
  coverageReporters: ['json', 'text-summary'],
});
