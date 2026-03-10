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
import { ReliableMockServer } from '../helpers/reliable-mock-server';

// Re-export type from reliable-mock-server
export type MockResponseConfig = {
  nextQuestion?: (callNumber: number) => object | null | undefined;
  draft?: object;
  error?: { status: number; message: string } | null;
  rawResponse?: string | (() => string);
};

type E2EFixtures = {
  mockServer: {
    url: string;
    // 🔴 FIX: setResponses is now async
    setResponses: (config: MockResponseConfig) => Promise<void>;
    getRequestLog: () => Array<{ method: string; url: string; body: unknown; timestamp: number }>;
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
      const server = new ReliableMockServer();
      const port = await server.start();

      await use({
        url: server.getUrl(),
        // 🔴 FIX: Wait for pending requests before setting responses
        setResponses: async (config: MockResponseConfig) => {
          await server.waitForPendingRequests();
          server.setResponses(config);
        },
        getRequestLog: () => server.getRequestLog(),
      });

      await server.stop();
    },
    { scope: 'test' },
  ],
  electronApp: [
    async ({ mockServer }, use) => {
      ensureBuildArtifacts();

      const app = await electron.launch({
        args: ['.', ...extraElectronArgs()],
        cwd: ROOT,
        env: getElectronEnv(mockServer.url),
      });

      const childProcess = app.process();
      childProcess.stderr?.on('data', (data) => process.stderr.write(data));
      childProcess.stdout?.on('data', (data) => process.stdout.write(data));

      await use(app);
      await app.close();
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
