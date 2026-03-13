import { defineConfig, devices } from '@playwright/test';
import baseConfig, { TIMEOUTS } from './playwright.config';

/**
 * CI 专用的 Playwright 配置
 * 针对 GitHub Actions 环境优化
 */
export default defineConfig({
  ...baseConfig,

  // CI 中使用更保守的设置
  workers: 1, // 串行执行以减少资源竞争
  fullyParallel: false,

  // 更长的超时（CI 环境较慢）
  timeout: TIMEOUTS.maximum, // 2 分钟（使用基础配置的常量）
  globalTimeout: 900000, // 15 分钟全局超时

  // 更多的重试
  retries: 3, // 失败后重试 3 次

  // 期望配置
  expect: {
    timeout: 20000, // 20 秒断言超时
  },

  // 报告器配置 - 详细的 CI 报告
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: '../../html-report',
        open: 'never',
      },
    ],
    [
      'junit',
      {
        outputFile: 'test-results/junit.xml',
      },
    ],
    ['github'], // GitHub Annotations
  ],

  use: {
    ...baseConfig.use,

    // 更频繁的跟踪
    trace: 'retain-on-failure', // 失败时保留 trace
    screenshot: 'on',
    video: 'retain-on-failure',

    // CI 专用的启动选项
    launchOptions: {
      slowMo: 0, // CI 中不减速
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-software-rasterizer',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update',
      ],
    },

    // 上下文选项
    contextOptions: {
      reducedMotion: 'reduce', // 减少动画
      viewport: { width: 1280, height: 720 },
    },
  },

  // 项目配置 - 只运行核心测试
  projects: [
    {
      name: 'ci-e2e',
      testMatch: [
        'specs/clarification/interview-flow.spec.ts',
        'specs/clarification/boundary-cases.spec.ts',
        // 先只运行核心测试，稳定后再添加更多
      ],
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
