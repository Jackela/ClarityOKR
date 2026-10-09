/** @type {import('jest').Config} */
module.exports = {
  rootDir: '../..',
  roots: ['<rootDir>/app/main/src', '<rootDir>/app/renderer/src'],
  ...require('jest-preset-angular/jest-preset.js'),
  setupFilesAfterEnv: ['<rootDir>/app/renderer/src/jest.setup.ts'],
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'html', 'js', 'json', 'mjs'],
  testMatch: ['<rootDir>/app/renderer/src/**/*.test.ts', '<rootDir>/app/renderer/src/**/*.spec.ts'],
  transform: {
    '^.+\\.(ts|js|mjs|html)$': [
      require.resolve('jest-preset-angular'),
      {
        tsconfig: '<rootDir>/app/renderer/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.html$',
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
  moduleNameMapper: {
    '^@renderer/(.*)$': '<rootDir>/app/renderer/src/$1',
    '^@shared/(.*)$': '<rootDir>/app/renderer/src/app/shared/$1',
    '^@core/(.*)$': '<rootDir>/app/renderer/src/app/core/$1',
    '^@services/(.*)$': '<rootDir>/app/renderer/src/app/services/$1',
    '^@env/(.*)\\.js$': '<rootDir>/app/renderer/src/environments/$1',
    '^@env/(.*)$': '<rootDir>/app/renderer/src/environments/$1',
    '^@clarityokr/contracts$': '<rootDir>/packages/contracts/src/index.ts',
    '^@clarityokr/main/(.*)$': '<rootDir>/app/main/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  ...require('../../scripts/coverage-config.cjs')('app/renderer/coverage'),
  verbose: true,
  testTimeout: 10000,
  maxWorkers: '50%',
};
