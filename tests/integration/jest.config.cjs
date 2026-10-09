const { defaultsESM } = require('ts-jest/presets');

module.exports = {
  ...defaultsESM,
  rootDir: '../..',
  testEnvironment: 'node',
  roots: [
    '<rootDir>/tests/integration/specs',
    '<rootDir>/app/main/src',
    '<rootDir>/app/renderer/src',
  ],
  testMatch: ['<rootDir>/tests/integration/specs/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      require.resolve('ts-jest'),
      {
        tsconfig: '<rootDir>/tests/integration/tsconfig.test.json',
        useESM: true,
        diagnostics: { ignoreCodes: ['TS151001'] },
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@clarityokr/contracts$': '<rootDir>/packages/contracts/src/index.ts',
    '^@clarityokr/main/(.*)\\.js$': '<rootDir>/app/main/src/$1',
    '^@clarityokr/main/(.*)$': '<rootDir>/app/main/src/$1',
    '^electron$': '<rootDir>/tests/integration/__mocks__/electron.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.cjs'],
  ...require('../../scripts/coverage-config.cjs')('tests/integration/coverage'),
  testTimeout: 60000,
  maxWorkers: process.env.CI ? 1 : '50%',
};
