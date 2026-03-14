/**
 * Pre-push E2E 配置
 * 只运行关键测试，确保快速完成
 */
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const globalSetupPath = path.join(currentDir, 'global-setup.ts');
const globalTeardownPath = path.join(currentDir, 'global-teardown.ts');

export default defineConfig({
  testDir: './specs',

  // 串行执行（更稳定）
  fullyParallel: false,
  workers: 1,

  // 本地 pre-push 不重试
  retries: 0,

  // 较短的超时（本地更快）
  timeout: 60000,

  // 全局设置和清理
  globalSetup: globalSetupPath,
  globalTeardown: globalTeardownPath,

  expect: {
    timeout: 10000,
  },

  use: {
    headless: true,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },

  // 只运行关键测试文件
  testMatch: [
    // 核心澄清流程
    '**/clarification/interview-flow.spec.ts',
  ],

  // 项目配置
  projects: [
    {
      name: 'e2e-prepush',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  reporter: [['line']],
});
