/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/specs'],
  testMatch: ['**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  testTimeout: 30000,
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.test.json',
        useESM: true,
        diagnostics: { ignoreCodes: ['TS151001'] },
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(@angular|@ngrx|opossum|nock|node-fetch)/)'],
  moduleNameMapper: {
    '^@clarityokr/(.*)$': '<rootDir>/../../packages/$1/src/index.ts',
    '^@clarityokr/main/(.*)$': '<rootDir>/../../app/main/src/$1',
    '^electron$': '<rootDir>/__mocks__/electron.ts',
    // Map .js imports from app/main/src to .ts files - handle the specific path pattern
    '^(.*)app/main/src/(.*)\\.js$': '<rootDir>/../../app/main/src/$2.ts',
  },
  testPathIgnorePatterns: ['/node_modules/'],
};
