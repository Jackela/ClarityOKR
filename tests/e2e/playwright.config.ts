import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getOptimizedConfig } from './helpers/ci-env';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const globalSetupPath = path.join(currentDir, 'global-setup.ts');
const globalTeardownPath = path.join(currentDir, 'global-teardown.ts');

// 获取根据环境优化的配置
const optimized = getOptimizedConfig();

/**
 * Unified timeout configuration for all E2E tests.
 * Use these constants instead of magic numbers.
 */
export const TIMEOUTS = {
  /** Very fast operations (ms) */
  immediate: 500,
  /** Fast operations like button clicks (ms) - increased to 8000ms for loading detection */
  fast: 8000,
  /** Standard operations (ms) */
  standard: 15000,
  /** Slow operations like loading indicators (ms) */
  slow: 30000,
  /** Very slow operations like initial app launch (ms) */
  verySlow: 60000,
  /** Maximum timeout for long operations (ms) */
  maximum: 120000,
} as const;

export default defineConfig({
  testDir: './specs',

  // 完全并行（每个文件一个 worker）- CI 中禁用
  fullyParallel: optimized.workers !== 1,

  // 使用优化后的 worker 配置
  workers: optimized.workers,

  // 使用优化后的重试配置
  retries: optimized.retries,

  // 使用优化后的超时配置
  timeout: optimized.timeout,

  // 全局设置和清理
  globalSetup: globalSetupPath,
  globalTeardown: globalTeardownPath,

  expect: {
    // 默认断言超时
    timeout: TIMEOUTS.standard,
  },

  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: optimized.trace,
    video: 'on-first-retry',
    actionTimeout: TIMEOUTS.standard,
    navigationTimeout: TIMEOUTS.slow,
  },

  // 项目配置
  projects: [
    {
      name: 'e2e',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  reporter: [['list'], ...(process.env.CI ? ([['github']] as const) : [])],
});
