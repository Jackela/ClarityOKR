import type { ElectronApplication, Page } from '@playwright/test';
import { test as base, _electron as electron } from '@playwright/test';
import { existsSync, promises as fs } from 'node:fs';
import {
  ROOT,
  MAIN_DIST,
  SESSION_PERSIST_PATH,
  OKR_PERSIST_PATH,
  extraElectronArgs,
  getElectronEnv,
  ensureBuildArtifacts,
} from '../helpers/build-check';
import type { MockResponseConfig } from '@clarityokr/contracts';
import {
  collectDiagnostics,
  printDiagnostics,
  getElectronArgs,
  logElectronState,
} from '../helpers/ci-diagnostics';
import { getElectronLaunchOptions } from '../helpers/electron-ci';
import { SimpleMockServer } from '../helpers/simple-mock-server';
import { collectSourceCoverage } from '../helpers/source-coverage';
import { startXvfb, stopXvfb, isXvfbAvailable } from '../helpers/xvfb-config';

/**
 * E2E test fixtures interface.
 * Defines all available fixtures for E2E tests.
 */
interface E2EFixtures {
  /**
   * Mock server for controlling LLM API responses.
   * Uses a simple HTTP server to respond to requests from Electron main process.
   * Now uses a global mock server instance shared across all tests.
   */
  mockServer: {
    /** The URL of the mock server */
    url: string;
    /** Configure response behavior */
    setResponses: (config: MockResponseConfig) => Promise<void>;
    /** Get the log of all requests made to the server */
    getRequestLog: () => Array<{ method: string; url: string; body: unknown; timestamp: number }>;
    /** Reset the mock server state */
    reset: () => Promise<void>;
  };

  /**
   * Electron application instance.
   * Automatically started before each test and cleaned up after.
   */
  electronApp: ElectronApplication;

  /**
   * Main window page object.
   * Provides access to the main application window.
   */
  mainWindow: Page;

  /**
   * Test bridge for accessing Electron internals.
   * @deprecated Reserved for future use. Currently use electronApp directly.
   */
  testBridge: {
    /**
     * Evaluate code in the main process context.
     * Uses the same signature as ElectronApplication.evaluate.
     * @param fn - Function to execute in main process
     * @param arg - Optional argument to pass to the function
     */
    evaluate: ElectronApplication['evaluate'];
  };
}

/**
 * Clean up persistence files between tests.
 * Removes session and OKR data files to ensure test isolation.
 */
export async function cleanupPersistenceFiles(): Promise<void> {
  const cleanupTargets = [SESSION_PERSIST_PATH, OKR_PERSIST_PATH];
  await Promise.all(
    cleanupTargets.map(async (target) => {
      if (existsSync(target)) {
        await fs.unlink(target);
      }
    }),
  );
}

/**
 * Enhanced test fixture with HTTP-based mocking.
 *
 * Key improvements:
 * - Global mock server shared across all tests (started in global-setup.ts)
 * - Works across process boundaries (test runner <-> Electron)
 * - Automatic cleanup on test failure
 * - Better error handling and logging
 */
export const test = base.extend<E2EFixtures>({
  // Playwright workers cannot share objects created by globalSetup.
  mockServer: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture args.
    async ({}, use) => {
      const server = new SimpleMockServer();
      await server.start();
      try {
        await use({
          url: server.getUrl(),
          setResponses: async (config: MockResponseConfig) => {
            await server.waitForPendingRequests();
            server.setResponses(config);
          },
          getRequestLog: () => server.getRequestLog(),
          reset: async () => {
            await server.waitForPendingRequests();
            server.setResponses({});
          },
        });
      } finally {
        await server.stop();
      }
    },
    { scope: 'test' },
  ],

  // Electron application fixture
  electronApp: [
    async ({ mockServer }, use, testInfo) => {
      // CI 环境中启动 Xvfb
      if (process.env.CI && isXvfbAvailable()) {
        await startXvfb();
      }

      ensureBuildArtifacts();

      // 收集并打印诊断信息
      if (process.env.CI) {
        const diagnostics = await collectDiagnostics();
        printDiagnostics(diagnostics);
      }

      // 在启动 Electron 之前清理持久化文件
      await cleanupPersistenceFiles();

      // CI 环境中添加短暂延迟确保文件系统操作完成
      if (process.env.CI) {
        await new Promise((r) => setTimeout(r, 200));
      }

      // 使用 CI 优化的 Electron 配置
      const ciConfig = getElectronLaunchOptions();

      // 使用 CI 优化的 Electron 参数
      const args = [MAIN_DIST, ...getElectronArgs(), ...extraElectronArgs(), ...ciConfig.args];

      // 启动 Electron
      const app = await electron.launch({
        args,
        cwd: ROOT,
        env: {
          ...getElectronEnv(mockServer.url),
          E2E_DB_PATH: testInfo.outputPath('clarityokr.db'),
          ...ciConfig.env,
        } as Record<string, string>,
      });

      const childProcess = app.process();
      const stderrHandler = (data: Buffer) => process.stderr.write(data);
      const stdoutHandler = (data: Buffer) => process.stdout.write(data);
      childProcess.stderr?.on('data', stderrHandler);
      childProcess.stdout?.on('data', stdoutHandler);

      let coverageError: unknown;
      try {
        await use(app);
      } finally {
        try {
          await collectSourceCoverage(app, testInfo.outputPath('source-coverage.json'));
        } catch (error) {
          coverageError = error;
        }
        // 记录最终状态（仅在 CI 且测试失败时）
        if (process.env.CI && testInfo.status !== 'passed') {
          await logElectronState(app);
        }

        // 先关闭所有窗口
        await app
          .evaluate(({ BrowserWindow }) => {
            BrowserWindow.getAllWindows().forEach((w) => {
              try {
                w.close();
              } catch {
                // ignore
              }
            });
          })
          .catch(() => {});

        // 移除事件监听
        childProcess.stderr?.off('data', stderrHandler);
        childProcess.stdout?.off('data', stdoutHandler);

        // 关闭应用
        await app.close().catch((err) => {
          console.error('[fixture] Error closing Electron app:', err);
        });

        // 再次清理持久化文件
        await cleanupPersistenceFiles();

        // CI 环境中停止 Xvfb
        if (process.env.CI) {
          await stopXvfb();
        }
      }
      if (coverageError) throw coverageError;
    },
    { scope: 'test' },
  ],

  // Main window fixture
  mainWindow: [
    async ({ electronApp }, use) => {
      // 🔴 FIX: Add better error handling and diagnostics for window creation
      let window: Page;
      try {
        window = await electronApp.firstWindow({ timeout: 60_000 });
      } catch (error) {
        console.error('[mainWindow] Failed to obtain the first window:', error);

        // Try to get diagnostic information
        try {
          const windows = await electronApp.evaluate(({ BrowserWindow }) => {
            return BrowserWindow.getAllWindows().map((w) => ({
              id: w.id,
              isVisible: w.isVisible(),
              isDestroyed: w.isDestroyed(),
              title: w.getTitle(),
            }));
          });
          console.error('[mainWindow] Current Electron windows:', windows);
        } catch (diagError) {
          console.error('[mainWindow] Failed to get window diagnostics:', diagError);
        }

        throw error;
      }

      window.on('console', (message) => {
        console.info('[renderer]', message.type(), message.text());
      });

      await window.evaluate(() => {
        console.info('[renderer] console hook confirmation');
      });
      await window.waitForLoadState('domcontentloaded');

      await use(window);
    },
    { scope: 'test' },
  ],

  // Test bridge fixture - reserved for future use
  testBridge: [
    async ({ electronApp }, use) => {
      await use({
        evaluate: electronApp.evaluate.bind(electronApp),
      });
    },
    { scope: 'test' },
  ],
});

export { expect } from '@playwright/test';
export { ROOT, launchElectronApp, findStickyWindow } from '../helpers/build-check';
export type { ElectronApplication, Page };
