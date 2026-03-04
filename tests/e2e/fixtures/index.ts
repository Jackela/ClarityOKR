import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { existsSync, promises as fs } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import {
  ROOT,
  SESSION_PERSIST_PATH,
  OKR_PERSIST_PATH,
  extraElectronArgs,
  getElectronEnv,
  ensureBuildArtifacts,
} from '../helpers/build-check';

export interface MockResponseConfig {
  /**
   * Function to generate next question response.
   * Return null to signal an error (503 response).
   * Return undefined to fall through to default response.
   */
  nextQuestion?: (callNumber: number) => object | null | undefined;
  draft?: object;
  error?: { status: number; message: string } | null;
  rawResponse?: string | (() => string);
}

type E2EFixtures = {
  mockServer: {
    url: string;
    port: number;
    setResponses: (config: MockResponseConfig) => void;
    getRequestLog: () => Array<{ method: string; url: string; body: unknown }>;
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

function waitForPortReady(port: number, timeout = 5000): Promise<void> {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() < deadline) {
          setTimeout(tryConnect, 100);
        } else {
          reject(new Error(`Port ${port} not ready after ${timeout}ms`));
        }
      });
      socket.connect(port, '127.0.0.1');
    };
    setTimeout(tryConnect, 50);
  });
}

export const test = base.extend<E2EFixtures>({
  mockServer: [
    async ({}, use, testInfo) => {
      const port = 7777 + testInfo.workerIndex;
      let callCounter = 0;
      let responseConfig: MockResponseConfig = {};
      const requestLog: Array<{ method: string; url: string; body: unknown }> = [];

      const server = http.createServer(async (req, res) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          let parsedBody: unknown;
          try {
            parsedBody = body ? JSON.parse(body) : null;
          } catch {
            parsedBody = body;
          }

          requestLog.push({
            method: req.method ?? 'UNKNOWN',
            url: req.url ?? '/',
            body: parsedBody,
          });

          if (process.env.E2E_DEBUG === 'true') {
            console.log('[mock-server] Request:', req.method, req.url, parsedBody);
          }

          if (req.method === 'POST' && req.url?.includes('/v1/responses')) {
            callCounter += 1;

            // Determine request type from body
            const body = parsedBody as Record<string, unknown> | null;
            const isDraftRequest =
              body?.intent === 'draft' || (body?.tool as string)?.includes?.('draft');

            if (process.env.E2E_DEBUG === 'true') {
              console.log(`[mock-server] Request #${callCounter}:`, { isDraftRequest, body });
            }

            // Handle draft requests first (highest priority when draft config is set)
            if (isDraftRequest && responseConfig.draft) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ draft: responseConfig.draft }));
              return;
            }

            // Handle raw response (for invalid response tests)
            if (responseConfig.rawResponse !== undefined) {
              const raw =
                typeof responseConfig.rawResponse === 'function'
                  ? responseConfig.rawResponse()
                  : responseConfig.rawResponse;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(raw);
              return;
            }

            // Handle nextQuestion with error signaling
            const nextQuestionFn = responseConfig.nextQuestion;
            if (nextQuestionFn) {
              const questionResponse = nextQuestionFn(callCounter);
              if (questionResponse === null) {
                // null signals error - return 503
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Service Unavailable' }));
                return;
              }
              if (questionResponse !== undefined) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(questionResponse));
                return;
              }
            }

            // Handle global error config (for network error tests)
            if (responseConfig.error) {
              const errorResponse = JSON.stringify({ error: responseConfig.error.message });
              res.writeHead(responseConfig.error.status, { 'Content-Type': 'application/json' });
              res.end(errorResponse);
              return;
            }

            // Default question response
            const defaultQuestion = {
              question: {
                id: `q${callCounter + 1}`,
                text: '再补充一个细节',
                options: [
                  { id: 'a', label: 'A', value: 'a' },
                  { id: 'b', label: 'B', value: 'b' },
                ],
              },
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(defaultQuestion));
            return;
          }

          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        });
      });

      await new Promise<void>((resolve, reject) => {
        server.listen(port, '127.0.0.1', async () => {
          try {
            await waitForPortReady(port);
            console.log(`[mock-server] Listening on http://127.0.0.1:${port}`);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
        server.on('error', reject);
      });

      const setResponses = (config: MockResponseConfig) => {
        responseConfig = config;
        callCounter = 0;
      };

      const getRequestLog = () => [...requestLog];

      await use({
        url: `http://127.0.0.1:${port}`,
        port,
        setResponses,
        getRequestLog,
      });

      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log(`[mock-server] Stopped on port ${port}`);
          resolve();
        });
      });
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
