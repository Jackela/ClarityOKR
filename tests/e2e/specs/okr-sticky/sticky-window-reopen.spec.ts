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
  const mainWindow = await electronApp.firstWindow();

  const mainWindowId = await electronApp.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows().at(0)?.id ?? -1
  );
  if (mainWindowId === -1) {
    throw new Error('Failed to resolve main window id');
  }

  await completeClarification(mainWindow);

  const initialStickySnapshot = await waitForStickyWindowSnapshot(electronApp, mainWindowId);

  await electronApp.evaluate(
    ({ BrowserWindow }, id) => {
      BrowserWindow.fromId(id)?.close();
    },
    initialStickySnapshot.windowId
  );

  await expect(mainWindow.locator('[data-testid="sticky-reopen"]')).toBeVisible();
  await mainWindow.click('[data-testid="sticky-reopen"]');

  const reopenedStickySnapshot = await waitForStickyWindowSnapshot(electronApp, mainWindowId, [
    initialStickySnapshot.windowId
  ]);

  expect(reopenedStickySnapshot.objective).toContain('提高效率');
  expect(reopenedStickySnapshot.keyResults.length).toBeGreaterThan(0);

  await electronApp.close();
});
function extraElectronArgs(): string[] {
  const raw = process.env.ELECTRON_EXTRA_LAUNCH_ARGS || '';
  return raw.trim() ? raw.trim().split(/\s+/) : [];
}
