/* eslint-disable @typescript-eslint/no-empty-object-type, no-empty-pattern */
import type { TestInfo } from '@playwright/test';
import { test as base, expect } from '@playwright/test';

// Re-export expect for convenience
export { expect };
import type { ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from '@playwright/test';
import { extraElectronArgs, getElectronEnv, ROOT } from '../helpers/build-check';
import { cleanupPersistenceFiles as indexCleanupPersistenceFiles } from './index';

// Re-export cleanupPersistenceFiles for convenience
export const cleanupPersistenceFiles = indexCleanupPersistenceFiles;
import { SimpleMockServer } from '../helpers/simple-mock-server';
import type { MockResponseConfig } from '@clarityokr/contracts';

// Worker 级别的 Electron 实例
let workerElectronApp: ElectronApplication | null = null;
let workerId: string | null = null;

// Worker 级别的 Mock Server
let workerMockServer: SimpleMockServer | null = null;

interface MockSessionData {
  initialIntent?: unknown;
  status?: unknown;
  confidence?: unknown;
  selections?: unknown[];
}

type SessionEntry = [string, MockSessionData];
interface MockServerFixture {
  url: string;
  port: number;
  setResponses: (config: MockResponseConfig) => Promise<void>;
  getRequestLog: () => Array<{ method: string; url: string; body: unknown; timestamp: number }>;
}

/**
 * 使用 testMode API 清理应用状态
 * 比文件清理更可靠，直接在主进程中重置内存状态
 */
async function cleanupViaTestMode(electronApp: ElectronApplication): Promise<void> {
  try {
    await electronApp.evaluate(async () => {
      const testMode = (
        global as {
          testMode?: {
            getCurrentState: () => { sessions?: Map<unknown, unknown>; currentSessionId?: unknown };
            mockResponses?: unknown;
          };
        }
      ).testMode;
      if (!testMode) {
        console.warn('[E2E] testMode not available');
        return null;
      }

      // 1. 重置状态
      console.log('[E2E] Using testMode.resetState()');
      // @ts-expect-error - testMode has resetState in E2E environment
      await testMode.resetState();

      // 2. 等待异步操作完成
      // @ts-expect-error - testMode has waitForAsyncOperations in E2E environment
      if (testMode.waitForAsyncOperations) {
        // @ts-expect-error - waitForAsyncOperations exists in E2E
        await testMode.waitForAsyncOperations(5000);
      }

      // 3. 验证重置成功
      const state = testMode.getCurrentState();
      console.log('[E2E] State after reset:', {
        sessionCount: state.sessions?.size || 0,
        currentSessionId: state.currentSessionId,
      });

      return state;
    });
    console.log('[E2E] TestMode cleanup successful');
  } catch (e) {
    console.warn('[E2E] TestMode cleanup failed:', e);
  }
}

/**
 * 降级清理：当 testMode 不可用时使用文件清理
 */
async function fallbackCleanup(): Promise<void> {
  console.log('[E2E] Falling back to file cleanup');
  try {
    await cleanupPersistenceFiles();
    console.log('[E2E] File cleanup successful');
  } catch (e) {
    console.warn('[E2E] File cleanup failed:', e);
  }
}

/**
 * 收集诊断信息，帮助调试 CI 失败
 */
async function logDiagnostics(
  electronApp: ElectronApplication,
  testInfo: TestInfo,
  testId?: string,
): Promise<void> {
  try {
    const diagnostics = await electronApp.evaluate(() => {
      const testMode = (
        global as {
          testMode?: {
            getCurrentState: () => { sessions?: Map<unknown, unknown>; currentSessionId?: unknown };
            mockResponses?: unknown;
          };
        }
      ).testMode;
      if (!testMode) return { error: 'testMode not available' };

      const state = testMode.getCurrentState();
      const sessions: Array<[string, unknown]> = Array.from(state.sessions?.entries?.() || []) as Array<[string, unknown]>;

      const sessionData = sessions.map((entry: SessionEntry) => {
        const [id, session] = entry;
        return {
          id,
          intent: session.initialIntent,
          status: session.status,
          confidence: session.confidence,
          selectionCount: session.selections?.length || 0,
        };
      });

      return {
        testModeAvailable: true,
        sessionCount: sessions.length,
        currentSessionId: state.currentSessionId,
        // @ts-expect-error - mockResponses available in E2E environment
        mockConfig: state.mockResponses,
      };
    });

    console.error(
      `[E2E] Diagnostics for ${testInfo.title} (testId: ${testId}):`,
      JSON.stringify(diagnostics, null, 2),
    );
  } catch (e) {
    console.error(`[E2E] Failed to collect diagnostics:`, e);
  }
}

/**
 * Enhanced test fixture with worker-level Electron and Mock Server isolation.
 *
 * Key improvements:
 * - Each worker has its own Mock Server on a dynamic port
 * - Each worker shares one Electron instance across all tests
 * - No port conflicts between parallel workers
 * - State is reset between tests using testMode API (more reliable than file cleanup)
 * - Significantly reduces test execution time (~50% faster)
 * - Supports parallel workers in CI with dynamic port allocation
 * - Comprehensive diagnostics for failed tests
 */
// Worker-scoped fixtures type definition
interface WorkerFixtures {
  mockServer: MockServerFixture;
  electronApp: ElectronApplication;
}

// Test-scoped fixtures type definition
interface TestFixtures {
  mainWindow: Page;
  testId: string;
}

type FixtureArgs = Record<string, unknown>;

const workerFixture = <T>(
  fn: (args: FixtureArgs, use: (value: T) => Promise<void>, testInfo: TestInfo) => Promise<void>,
) => [fn, { scope: 'worker' as const }] as const;

const testFixture = <T>(
  fn: (args: FixtureArgs, use: (value: T) => Promise<void>, testInfo: TestInfo) => Promise<void>,
) => [fn, { scope: 'test' as const }] as const;

export const workerTest = base.extend<TestFixtures, WorkerFixtures>({
  // Test ID fixture for tracing
  testId: [
    async ({}, use, testInfo) => {
      const id = `${testInfo.workerIndex.toString()}-${testInfo.retry.toString()}-${Date.now().toString()}`;
      await use(id);
    },
    { scope: 'test' as const },
  ],

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
      });
    },
    { scope: 'worker' as const },
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

        // 启动 Electron，使用当前 worker 的 Mock Server URL
        workerElectronApp = await electron.launch({
          args: ['.', ...extraElectronArgs()],
          cwd: ROOT,
          env: getElectronEnv(mockServer.url),
        });

        console.log(`[worker ${workerId}] Electron started with mock server at ${mockServer.url}`);

        // 验证 testMode API 可用
        const testModeAvailable = await workerElectronApp
          .evaluate(() => {
            interface TestModeGlobal {
              testMode?: { resetState?: () => Promise<void> };
            }
            return !!(global as TestModeGlobal).testMode;
          })
          .catch(() => false);
        console.log(`[worker ${workerId}] TestMode API available: ${testModeAvailable}`);
      }

      await use(workerElectronApp!);
    },
    { scope: 'worker' as const },
  ],

  // Test 级别：每个测试使用相同的 Electron 但清理状态
  mainWindow: [
    async ({ electronApp, testId }, use, testInfo) => {
      const diagnosticInfo = {
        testId,
        testName: testInfo.title,
        startTime: new Date().toISOString(),
      };

      console.log(`[E2E] Test ${testId} started:`, testInfo.title);

      // 获取窗口
      const window = await electronApp.firstWindow();

      // 使用 testMode API 清理状态（更可靠）
      const testModeAvailable = await electronApp
        .evaluate(() => {
        return !!(global as { testMode?: { resetState?: () => Promise<void> } }).testMode?.resetState;
        })
        .catch(() => false);

      if (testModeAvailable) {
        await cleanupViaTestMode(electronApp);
      } else {
        console.warn('[E2E] testMode.resetState not available, falling back to file cleanup');
        await fallbackCleanup();
      }

      // 等待重置完成
      await new Promise((r) => setTimeout(r, process.env.CI ? 200 : 100));

      // 导航到首页（确保干净状态）
      await window.goto('about:blank');
      await window.goto(`file://${ROOT}/app/renderer/dist/index.html`);

      try {
        await use(window);
      } finally {
        // 测试结束后：如果测试失败，记录诊断信息
        if (testInfo.status !== 'passed') {
          await logDiagnostics(electronApp, testInfo, testId);
        }
      }
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
