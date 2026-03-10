import { test as base } from '@playwright/test';
import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { extraElectronArgs, getElectronEnv, ROOT } from '../helpers/build-check';
import { cleanupPersistenceFiles } from './index';
import { SimpleMockServer } from '../helpers/simple-mock-server';
import type { MockResponseConfig } from '@clarityokr/contracts';

// Worker 级别的 Electron 实例
let workerElectronApp: ElectronApplication | null = null;
let workerId: string | null = null;

// Worker 级别的 Mock Server
let workerMockServer: SimpleMockServer | null = null;

// Mock Server 类型定义
interface MockServerFixture {
  url: string;
  port: number;
  setResponses: (config: MockResponseConfig) => Promise<void>;
  getRequestLog: () => Array<{ method: string; url: string; body: unknown; timestamp: number }>;
}

/**
 * Enhanced test fixture with worker-level Electron and Mock Server isolation.
 *
 * Key improvements:
 * - Each worker has its own Mock Server on a dynamic port
 * - Each worker shares one Electron instance across all tests
 * - No port conflicts between parallel workers
 * - State is reset between tests instead of restarting the app
 * - Significantly reduces test execution time (~50% faster)
 * - Supports parallel workers in CI with dynamic port allocation
 */
export const workerTest = base.extend<{
  mockServer: MockServerFixture;
  electronApp: ElectronApplication;
  mainWindow: Page;
}>({
  // Worker 级别：每个 worker 启动自己的 Mock Server
  mockServer: [
    async ({}, use, testInfo) => {
      // 为每个 worker 创建独立的 Mock Server
      if (!workerMockServer) {
        workerMockServer = new SimpleMockServer();
        // 使用动态端口（get-port 会自动寻找可用端口）
        await workerMockServer.start();
        console.log(`[worker ${testInfo.workerIndex}] Mock server started`);
      }

      await use({
        url: workerMockServer.getUrl(),
        port: workerMockServer.getPort(),
        setResponses: async (config: MockResponseConfig) => {
          await workerMockServer!.waitForPendingRequests(3000);
          workerMockServer!.setResponses(config);
        },
        getRequestLog: () => workerMockServer!.getRequestLog(),
        reset: () => workerMockServer!.reset(),
      });
    },
    { scope: 'worker' },
  ],

  // Worker 级别：每个 worker 启动一次 Electron
  electronApp: [
    async ({ mockServer }, use, testInfo) => {
      // 如果是新的 worker，启动新的 Electron 实例
      if (workerId !== testInfo.workerIndex.toString()) {
        // 清理旧的实例
        if (workerElectronApp) {
          try {
            await workerElectronApp.close();
          } catch (err) {
            console.error('[worker] Error closing previous Electron app:', err);
          }
        }

        workerId = testInfo.workerIndex.toString();

        // 清理持久化文件
        await cleanupPersistenceFiles();

        // 启动 Electron，使用当前 worker 的 Mock Server URL
        workerElectronApp = await electron.launch({
          args: ['.', ...extraElectronArgs()],
          cwd: ROOT,
          env: getElectronEnv(mockServer.url),
        });

        console.log(`[worker ${workerId}] Electron started with mock server at ${mockServer.url}`);
      }

      await use(workerElectronApp!);
    },
    { scope: 'worker' },
  ],

  // Test 级别：每个测试使用相同的 Electron 但清理状态
  mainWindow: [
    async ({ electronApp }, use) => {
      // 清理应用状态
      await electronApp
        .evaluate(() => {
          // 如果有 testMode API，调用它
          if ((global as any).testMode?.resetState) {
            (global as any).testMode.resetState();
          }
        })
        .catch(() => {});

      // 清理持久化文件
      await cleanupPersistenceFiles();

      // 获取第一个窗口
      const window = await electronApp.firstWindow();

      // 导航到首页
      await window.goto('about:blank');
      await window.goto(`file://${ROOT}/app/renderer/dist/index.html`);

      await use(window);

      // 测试后清理
      await cleanupPersistenceFiles();
    },
    { scope: 'test' },
  ],
});

// Worker 清理 - 在所有测试完成后调用
export async function cleanupWorker() {
  console.log('[cleanupWorker] Cleaning up worker resources...');

  if (workerElectronApp) {
    await workerElectronApp.close();
    workerElectronApp = null;
  }

  if (workerMockServer) {
    await workerMockServer.stop();
    workerMockServer = null;
  }

  workerId = null;
  console.log('[cleanupWorker] Cleanup complete');
}
