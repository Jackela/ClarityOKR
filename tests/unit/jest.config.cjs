const { defaultsESM } = require('ts-jest/presets');

module.exports = {
  ...defaultsESM,
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  roots: [
    '<rootDir>/clarification',
    '<rootDir>/contracts',
    '<rootDir>/okr-sticky',
    '<rootDir>/main',
    '<rootDir>/lib',
    '<rootDir>/services',
    '<rootDir>/controllers',
    '<rootDir>/persistence',
    '<rootDir>/telemetry',
    '<rootDir>/windows',
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  extensionsToTreatAsEsm: ['.ts'],
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
  transformIgnorePatterns: ['node_modules/(?!(@angular|@ngrx|rxjs)/)'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@clarityokr/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@clarityokr/main/(.*)$': '<rootDir>/../../app/main/src/$1',
    '^@clarityokr/renderer/app/okr-sticky/stores/edit-mode.store$':
      '<rootDir>/__mocks__/angular-renderer/app/okr-sticky/stores/edit-mode.store.cjs',
    '^@clarityokr/renderer/(.*)$': '<rootDir>/__mocks__/angular-renderer/$1',
    '^@angular/core$': '<rootDir>/__mocks__/angular-core.ts',
    '^rxjs$': '<rootDir>/__mocks__/rxjs.ts',
    '^electron$': '<rootDir>/__mocks__/electron.ts',
    '^.*secure-storage.service\\.js$': '<rootDir>/__mocks__/secure-storage.service.ts',
  },
  collectCoverageFrom: [
    '../../app/main/src/**/*.ts',
    '../../app/renderer/src/**/*.ts',
    '!**/*.spec.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  collectCoverage: process.env.COVERAGE === 'true',
};
