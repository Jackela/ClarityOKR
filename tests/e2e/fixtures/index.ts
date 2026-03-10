import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { existsSync, promises as fs } from 'node:fs';
import {
  ROOT,
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
import { startXvfb, stopXvfb, isXvfbAvailable } from '../helpers/xvfb-config';

// Re-export type from reliable-mock-server for compatibility
export type { MockResponseConfig };

type E2EFixtures = {
  mockServer: {
    url: string;
    // setResponses is now async
    setResponses: (config: MockResponseConfig) => Promise<void>;
    getRequestLog: () => Array<{ method: string; url: string; body: unknown; timestamp: number }>;
    // Reset the mock server state
    reset: () => Promise<void>;
  };
  electronApp: ElectronApplication;
  mainWindow: Page;
};

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

export const test = base.extend<E2EFixtures>({
  mockServer: [
    async ({}, use) => {
      const port = process.env.MOCK_SERVER_PORT || '7777';
      const url = `http://127.0.0.1:${port}`;

      // 导入全局 server 实例
      const { globalMockServer } = await import('../global-setup');

      await use({
        url,
        // Wait for pending requests before setting responses
        setResponses: async (config: MockResponseConfig) => {
          await globalMockServer.waitForPendingRequests();
          globalMockServer.setResponses(config);
        },
        getRequestLog: () => globalMockServer.getRequestLog(),
        // Reset the mock server state for test isolation
        reset: async () => {
          await globalMockServer.waitForPendingRequests();
          globalMockServer.setResponses({});
        },
      });

      // Note: We don't stop the server here - it's managed by globalSetup teardown
      // But we do reset the state for the next test
      await globalMockServer.waitForPendingRequests();
      globalMockServer.setResponses({});
    },
    { scope: 'test' },
  ],
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
      const args = ['.', ...getElectronArgs(), ...extraElectronArgs(), ...ciConfig.args];

      // 启动 Electron
      const app = await electron.launch({
        args,
        cwd: ROOT,
        env: {
          ...getElectronEnv(mockServer.url),
          ...ciConfig.env,
        },
      });

      const childProcess = app.process();
      const stderrHandler = (data: Buffer) => process.stderr.write(data);
      const stdoutHandler = (data: Buffer) => process.stdout.write(data);
      childProcess.stderr?.on('data', stderrHandler);
      childProcess.stdout?.on('data', stdoutHandler);

      try {
        await use(app);
      } finally {
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
              } catch {}
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
    },
    { scope: 'test' },
  ],
  mainWindow: [
    async ({ electronApp }, use) => {
      const window = await electronApp.waitForEvent('window', { timeout: 60_000 });

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
});

export { expect } from '@playwright/test';
export { ROOT, launchElectronApp, findStickyWindow } from '../helpers/build-check';
export type { ElectronApplication, Page };
