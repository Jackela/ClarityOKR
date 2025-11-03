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

async function waitForStickyWindowSnapshotOld(
  electronApp: import('@playwright/test').ElectronApplication,
  mainWindowId: number,
  excludeWindowIds: number[] = []
): Promise<StickyWindowSnapshot> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const snapshot = await electronApp.evaluate(
      async ({ BrowserWindow }, params) => {
        const { mainId, excluded } = params;
        const sticky = BrowserWindow.getAllWindows().find((candidate) => {
          if (candidate.id === mainId || excluded.includes(candidate.id)) {
            return false;
          }
          const url = candidate.webContents.getURL();
          return url.includes('index.html');
        });
        if (!sticky) {
          return null;
        }
        const payload = await sticky.webContents.executeJavaScript(
          `(() => {
            const objective = document.querySelector('[data-testid="sticky-objective"]')?.textContent ?? '';
            const keyResults = Array.from(document.querySelectorAll('[data-testid="sticky-key-result"]')).map((el) => el.textContent ?? '');
            return { objective, keyResults };
          })();`
        );
        return {
          windowId: sticky.id,
          isTop: sticky.isAlwaysOnTop(),
          objective: payload.objective,
          keyResults: payload.keyResults
        };
      },
      { mainId: mainWindowId, excluded: excludeWindowIds }
    );
    if (snapshot) {
      return snapshot;
    }
    const remaining = Math.max(0, deadline - Date.now());
    try {
      await electronApp.context().waitForEvent('page', { timeout: remaining });
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) {
        throw error;
      }
    }
  }
  throw new Error('Timed out waiting for sticky window');
}

async function waitForStickyWindow(
  electronApp: import('@playwright/test').ElectronApplication,
  mainWindow: ElectronPage
): Promise<ElectronPage> {
  const ctx = electronApp.context();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const pages = ctx.pages();
    const sticky = pages.find((p) => p !== mainWindow);
    if (sticky) return sticky;
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

test('user can reopen sticky window after closing it', async () => {
  const electronApp = await electron.launch({ args: ['.', ...extraElectronArgs()], cwd: ROOT });
  const childProcess = electronApp.process();
  childProcess.stderr?.on('data', (data) => process.stderr.write(data));
  childProcess.stdout?.on('data', (data) => process.stdout.write(data));
  const mainWindow = await electronApp.waitForEvent('window', { timeout: 60_000 });

  await completeClarification(mainWindow);

  const initialStickyWindow = await waitForStickyWindow(electronApp, mainWindow);

  await initialStickyWindow.close();

  await expect(mainWindow.locator('[data-testid="sticky-reopen"]')).toBeVisible();
  await mainWindow.click('[data-testid="sticky-reopen"]');

  const reopenedStickyWindow = await waitForStickyWindow(electronApp, mainWindow);
  await expect(reopenedStickyWindow.locator('[data-testid="sticky-objective"]')).toContainText('提高效率');
  const kr = await reopenedStickyWindow.locator('[data-testid="sticky-key-result"]').allInnerTexts();
  expect(kr.length).toBeGreaterThan(0);

  await electronApp.close();
});
function extraElectronArgs(): string[] {
  const raw = process.env.ELECTRON_EXTRA_LAUNCH_ARGS || '';
  return raw.trim() ? raw.trim().split(/\s+/) : [];
}
