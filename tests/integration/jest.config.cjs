/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/specs'],
  testMatch: ['**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['./setup.cjs'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 30000,
  transform: {
    '^.+\\.tsx?$': [
      '<rootDir>/ts-jest-transformer.cjs',
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
    // Map .js imports from app/main/src to .ts files
    '^(.*)/app/main/src/(.*)\\.js$': '<rootDir>/../../app/main/src/$2.ts',
    // Handle imports without extension (add .ts) - match paths ending with a filename (no dots in last segment)
    '^(.*?)/app/main/src/(.*[^/\\.])$': '<rootDir>/../../app/main/src/$2.ts',
    // Handle relative .js imports from test specs (strip .js extension for ts-jest)
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testPathIgnorePatterns: ['/node_modules/'],
};
