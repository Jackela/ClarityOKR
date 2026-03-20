const { defaultsESM } = require('ts-jest/presets');

module.exports = {
  ...defaultsESM,
  testEnvironment: 'node',
  roots: ['<rootDir>/specs', '<rootDir>/../../app/main/src'],
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  testTimeout: 30000,
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.test.json',
        useESM: true,
        diagnostics: { ignoreCodes: ['TS151001'] },
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(@angular|@ngrx|opossum)/)'],

  moduleNameMapper: {
    '^@clarityokr/(.*)$': '<rootDir>/../../packages/$1/dist/index.js',
    '^../../../app/main/(.*)\\.js$': '<rootDir>/../../app/main/$1',
    '^../../../app/renderer/(.*)\\.js$': '<rootDir>/../../app/renderer/$1',
    '^electron$': '<rootDir>/__mocks__/electron.ts',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    'specs/circuit-breaker',
    'specs/cache/llm-cache',
    'specs/encryption/encrypted-storage',
    'specs/clarification\\.repair',
    'specs/clarification\\.error',
    'specs/error-handling',
    'specs/llm/',
    'specs/ipc\\.llm',
    'specs/persistence/',
    'specs/draft\\.success',
    'specs/draft\\.incomplete',
    'specs/clarification\\.success',
    'specs/clarification\\.provider-errors',
    'specs/clarification\\.timeout',
    'specs/draft\\.errors',
  ],
};
