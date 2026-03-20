const { defaultsESM } = require('ts-jest/presets');

module.exports = {
  ...defaultsESM,
  testEnvironment: 'node',
  roots: ['<rootDir>/specs', '<rootDir>/../../app/main/src'],
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  testTimeout: 30000,
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '../../tsconfig.base.json', useESM: true }],
  },
  moduleNameMapper: {
    '^(.*)\\.js$': '$1',
    '^@clarityokr/(.*)$': '<rootDir>/../../packages/$1/dist/index.js',
    '^../../../app/main/(.*)$': '<rootDir>/../../app/main/$1',
    '^electron$': '<rootDir>/__mocks__/electron.ts',
  },
};
