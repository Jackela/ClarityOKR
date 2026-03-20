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
    'circuit-breaker',
    'llm-cache',
    'encrypted-storage',
    'clarification\\.repair',
    'clarification\\.error',
  ],
};
