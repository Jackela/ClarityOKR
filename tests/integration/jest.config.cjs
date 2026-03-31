const { defaultsESM } = require('ts-jest/presets');

module.exports = {
  ...defaultsESM,
  testEnvironment: 'node',
  roots: ['<rootDir>/specs'],
  testPathIgnorePatterns: ['/node_modules/'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@clarityokr/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@clarityokr/main/(.*)$': '<rootDir>/../../app/main/src/$1',
    '^electron$': '<rootDir>/__mocks__/electron.ts',
  },
  testTimeout: 60000,
};
