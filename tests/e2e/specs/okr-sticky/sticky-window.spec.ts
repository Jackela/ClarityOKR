import { _electron as electron, errors, expect, test } from '@playwright/test';
import { existsSync, promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(currentDir, '../../../..');
const SESSION_PERSIST_PATH = path.join(ROOT, 'data', 'clarification-session.json');
const OKR_PERSIST_PATH = path.join(ROOT, 'data', 'okr-document.json');
type ElectronPage = import('@playwright/test').Page;

interface StickyWindowSnapshot {
  windowId: number;
  isTop: boolean;
  objective: string;
  keyResults: string[];
}

async function completeClarification(mainWindow: ElectronPage) {
  await mainWindow.waitForSelector('[data-testid="intent-input"]');
  await mainWindow.fill('[data-testid="intent-input"]', '提高效率');
  await expect(mainWindow.locator('[data-testid="start-clarification"]')).toBeEnabled({ timeout: 15_000 });
  await mainWindow.click('[data-testid="start-clarification"]');

  await mainWindow.waitForSelector('[data-testid="clarification-option"]');
  const optionLocator = mainWindow.locator('[data-testid="clarification-option"]');
  await optionLocator.first().click();
  await mainWindow.waitForTimeout(500);
  await expect(optionLocator.last()).toBeVisible({ timeout: 15_000 });
  await optionLocator.last().click();

  const generateButton = mainWindow.locator('[data-testid="clarification-generate"]');
  await expect(generateButton).toBeEnabled({ timeout: 15_000 });
  await generateButton.click();
}

function startMockLlmServer(port = 7777) {
  let counter = 0;
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url && req.url.includes('/v1/responses')) {
      counter += 1;
      if (counter <= 2) {
        const body = JSON.stringify({
          question: {
            id: `q${counter + 1}`,
            text: '请选择下一步',
            options: [
              { id: 'a', label: 'A', value: 'a' },
              { id: 'b', label: 'B', value: 'b' }
            ]
          }
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(body);
        return;
      }
      const draft = JSON.stringify({
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '提高效率',
              description: '自动生成',
              keyResults: [
                { id: 'kr1', statement: 'KR1', target: '10%', measurement: 'rate' },
                { id: 'kr2', statement: 'KR2', target: 5, measurement: 'count' },
                { id: 'kr3', statement: 'KR3', target: '2s', measurement: 'latency' }
              ]
            }
          ]
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(draft);
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise<http.Server>((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

async function waitForStickyWindowSnapshot(
  electronApp: import('@playwright/test').ElectronApplication,
  mainWindow: ElectronPage
): Promise<StickyWindowSnapshot> {
  // Wait until a second window appears, then query its DOM
  const ctx = electronApp.context();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const pages = ctx.pages();
    const sticky = pages.find((p) => p !== mainWindow);
    if (sticky) {
      const objective = await sticky.locator('[data-testid="sticky-objective"]').innerText();
      const keyResults = await sticky.locator('[data-testid="sticky-key-result"]').allInnerTexts();
      const isTop = await electronApp.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((bw) => bw.webContents.getURL().includes('index.html') && bw.isAlwaysOnTop());
        return !!win;
      });
      return {
        windowId: 0,
        isTop,
        objective,
        keyResults
      };
    }
    const remaining = Math.max(0, deadline - Date.now());
    try {
      await ctx.waitForEvent('page', { timeout: remaining });
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) {
        throw error;
      }
    }
  }
  throw new Error('Timed out waiting for sticky window');
}

async function debugWindows(electronApp: import('@playwright/test').ElectronApplication) {
  const urls = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({ id: w.id, url: w.webContents.getURL(), isTop: w.isAlwaysOnTop() }))
  );
  // eslint-disable-next-line no-console
  console.info('[e2e] windows:', JSON.stringify(urls));
}

test.beforeEach(async () => {
  const cleanupTargets = [SESSION_PERSIST_PATH, OKR_PERSIST_PATH];
  await Promise.all(
    cleanupTargets.map(async (target) => {
      if (existsSync(target)) {
        await fs.unlink(target);
      }
    })
  );
});

test('sticky window stays always-on-top with OKR contents rendered', async () => {
  const server = await startMockLlmServer();
  const electronApp = await electron.launch({ args: ['.', ...extraElectronArgs()], cwd: ROOT, env: { ...process.env, LLM_API_KEY: 'test', LLM_BASE_URL: 'http://127.0.0.1:7777', LLM_MODEL: 'test' } });
  const childProcess = electronApp.process();
  childProcess.stderr?.on('data', (data) => process.stderr.write(data));
  childProcess.stdout?.on('data', (data) => process.stdout.write(data));
  const mainWindow = await electronApp.waitForEvent('window', { timeout: 60_000 });

  mainWindow.on('console', (message) => {
    // eslint-disable-next-line no-console
    console.info('[main-console]', message.type(), message.text());
  });

  await completeClarification(mainWindow);
  await debugWindows(electronApp);
  // Explicitly open sticky window from main UI
  await expect(mainWindow.locator('[data-testid="sticky-reopen"]')).toBeVisible({ timeout: 15_000 });
  await mainWindow.click('[data-testid="sticky-reopen"]');

  let stickySnapshot: StickyWindowSnapshot;
  try {
    stickySnapshot = await waitForStickyWindowSnapshot(electronApp, mainWindow);
  } catch (err) {
    await debugWindows(electronApp);
    throw err;
  }
  const enforcedAlwaysOnTop = await electronApp.evaluate(
    ({ BrowserWindow }, id) => {
      const win = BrowserWindow.fromId(id);
      if (!win) {
        return false;
      }
      win.setAlwaysOnTop(true, 'screen-saver');
      return win.isAlwaysOnTop();
    },
    stickySnapshot.windowId
  );
  expect(enforcedAlwaysOnTop).toBe(true);
  expect(stickySnapshot.objective).toContain('提高效率');
  expect(stickySnapshot.keyResults).toHaveLength(2);

  await electronApp.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
function extraElectronArgs(): string[] {
  const raw = process.env.ELECTRON_EXTRA_LAUNCH_ARGS || '';
  return raw.trim() ? raw.trim().split(/\s+/) : [];
}
