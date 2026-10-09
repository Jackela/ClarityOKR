const { defaultsESM } = require('ts-jest/presets');

module.exports = {
  rootDir: '../..',
  testMatch: ['<rootDir>/tests/unit/**/*.spec.ts'],
  ...defaultsESM,
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/unit/jest.setup.cjs'],
  roots: [
    '<rootDir>/app/main/src',
    '<rootDir>/app/renderer/src',
    '<rootDir>/tests/unit/clarification',
    '<rootDir>/tests/unit/contracts',
    '<rootDir>/tests/unit/core',
    '<rootDir>/tests/unit/okr-sticky',
    '<rootDir>/tests/unit/main',
    '<rootDir>/tests/unit/lib',
    '<rootDir>/tests/unit/services',
    '<rootDir>/tests/unit/controllers',
    '<rootDir>/tests/unit/persistence',
    '<rootDir>/tests/unit/telemetry',
    '<rootDir>/tests/unit/windows',
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      require.resolve('ts-jest'),
      {
        tsconfig: '<rootDir>/tests/unit/tsconfig.test.json',
        useESM: true,
        diagnostics: { ignoreCodes: ['TS151001'] },
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(@angular|@ngrx|rxjs)/)'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@clarityokr/contracts$': '<rootDir>/packages/contracts/src/index.ts',
    '^@clarityokr/main/(.*)$': '<rootDir>/app/main/src/$1',
    '^@clarityokr/renderer/app/okr-sticky/stores/edit-mode.store$':
      '<rootDir>/tests/unit/__mocks__/angular-renderer/app/okr-sticky/stores/edit-mode.store.cjs',
    '^@clarityokr/renderer/(.*)$': '<rootDir>/tests/unit/__mocks__/angular-renderer/$1',
    '^@angular/core$': '<rootDir>/tests/unit/__mocks__/angular-core.ts',
    '^rxjs$': '<rootDir>/tests/unit/__mocks__/rxjs.ts',
    '^electron$': '<rootDir>/tests/unit/__mocks__/electron.ts',
    '^.*secure-storage.service\\.js$': '<rootDir>/tests/unit/__mocks__/secure-storage.service.ts',
  },
  ...require('../../scripts/coverage-config.cjs')('tests/unit/coverage'),
};
