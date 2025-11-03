import { _electron as electron, errors, expect, test } from '@playwright/test';
import { existsSync, promises as fs } from 'node:fs';
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
  await expect(mainWindow.locator('[data-testid="start-clarification"]')).toBeEnabled();
  await mainWindow.click('[data-testid="start-clarification"]');

  await mainWindow.waitForSelector('[data-testid="clarification-option"]');
  const optionLocator = mainWindow.locator('[data-testid="clarification-option"]');
  await optionLocator.first().click();
  await mainWindow.waitForTimeout(500);
  await expect(optionLocator.last()).toBeVisible();
  await optionLocator.last().click();

  const generateButton = mainWindow.locator('[data-testid="clarification-generate"]');
  await expect(generateButton).toBeEnabled();
  await generateButton.click();
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
  const electronApp = await electron.launch({ args: ['.', ...extraElectronArgs()], cwd: ROOT });
  const childProcess = electronApp.process();
  childProcess.stderr?.on('data', (data) => process.stderr.write(data));
  childProcess.stdout?.on('data', (data) => process.stdout.write(data));
  const mainWindow = await electronApp.waitForEvent('window', { timeout: 60_000 });

  mainWindow.on('console', (message) => {
    // eslint-disable-next-line no-console
    console.info('[main-console]', message.type(), message.text());
  });

  await completeClarification(mainWindow);

  const stickySnapshot = await waitForStickyWindowSnapshot(electronApp, mainWindow);
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
});
function extraElectronArgs(): string[] {
  const raw = process.env.ELECTRON_EXTRA_LAUNCH_ARGS || '';
  return raw.trim() ? raw.trim().split(/\s+/) : [];
}
