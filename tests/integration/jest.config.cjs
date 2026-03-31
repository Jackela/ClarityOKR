const { defaultsESM } = require('ts-jest/presets');

module.exports = {
  ...defaultsESM,
  testEnvironment: 'node',
  roots: ['<rootDir>/specs'],
  testPathIgnorePatterns: ['/node_modules/'],
  extensionsToTreatAsEsm: ['.ts'],
  resolver: '<rootDir>/resolver.cjs',
  moduleNameMapper: {
    '^@clarityokr/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@clarityokr/main/(.*)$': '<rootDir>/../../app/main/src/$1',
    '^electron$': '<rootDir>/__mocks__/electron.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/setup.cjs'],
  testTimeout: 60000,
};
