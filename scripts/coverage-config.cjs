// Each test layer measures the same product sources; the gate uses their merged hits.
module.exports = (directory) => ({
  collectCoverage: process.env.COVERAGE === 'true',
  collectCoverageFrom: [
    'app/main/src/**/*.ts',
    'app/renderer/src/**/*.ts',
    '!**/*.spec.ts',
    '!**/*.test.ts',
    '!**/*.d.ts',
    '!app/renderer/src/jest.setup.ts',
    '!app/renderer/src/test.ts',
  ],
  coverageDirectory: `<rootDir>/${directory}`,
  coverageReporters: ['json', 'text-summary'],
});
