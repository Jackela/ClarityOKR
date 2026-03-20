const { defaultsESM } = require('ts-jest/presets');

module.exports = {
  ...defaultsESM,
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  roots: [
    '<rootDir>/clarification',
    '<rootDir>/okr-sticky',
    '<rootDir>/main',
    '<rootDir>/lib',
    '<rootDir>/handlers', // 任务19.4: Handler单元测试
    '<rootDir>/services', // 任务19.2-19.3: Service单元测试
    '<rootDir>/controllers', // 任务19.1: Controller单元测试
    '<rootDir>/persistence', // 持久化测试
    '<rootDir>/telemetry', // 遥测测试
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    'crash-recovery', // Flaky test - backup count timing issue
  ],
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
    '^@clarityokr/renderer/(.*)$': '<rootDir>/../../app/renderer/src/$1',
    '^electron$': '<rootDir>/__mocks__/electron.ts',
    '^.*secure-storage.service\\.js$': '<rootDir>/__mocks__/secure-storage.service.ts',
  },
  // 任务19.8: 配置覆盖率报告
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
  // 收集覆盖率时包含所有源文件
  collectCoverage: process.env.COVERAGE === 'true',
};
