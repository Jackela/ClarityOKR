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
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^../../../app/main/src/services/(.*)\\.js$': '<rootDir>/../../app/main/src/services/$1',
    '^../../../app/main/(.*)$': '<rootDir>/../../app/main/$1',
    '^electron$': '<rootDir>/__mocks__/electron.ts',
  },
};
