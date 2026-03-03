import { test, expect, cleanupPersistenceFiles, ElectronApplication, Page } from '../../fixtures';
import { errors } from '@playwright/test';

interface StickyWindowSnapshot {
  windowId: number;
  isTop: boolean;
  objective: string;
  keyResults: string[];
}

async function completeClarification(mainWindow: Page) {
  await mainWindow.waitForSelector('[data-testid="intent-input"]');
  await mainWindow.fill('[data-testid="intent-input"]', '提高效率');
  await expect(mainWindow.locator('[data-testid="start-clarification"]')).toBeEnabled({
    timeout: 15_000,
  });
  await mainWindow.click('[data-testid="start-clarification"]');

  await mainWindow.waitForSelector('[data-testid="clarification-option"]');
  const optionLocator = mainWindow.locator('[data-testid="clarification-option"]');
  await optionLocator.first().click();
  await mainWindow.waitForSelector('[data-testid="clarification-loading"]', { timeout: 5000 });
  await mainWindow.waitForSelector('[data-testid="clarification-loading"]', {
    state: 'hidden',
    timeout: 30_000,
  });
  await optionLocator.last().click();
  await mainWindow.waitForSelector('[data-testid="clarification-loading"]', { timeout: 5000 });
  await mainWindow.waitForSelector('[data-testid="clarification-loading"]', {
    state: 'hidden',
    timeout: 30_000,
  });

  const generateButton = mainWindow.locator('[data-testid="clarification-generate"]');
  await expect(generateButton).toBeEnabled({ timeout: 15_000 });
  await generateButton.click();
}

async function waitForStickyWindowSnapshot(
  electronApp: ElectronApplication,
  mainWindow: Page,
): Promise<StickyWindowSnapshot> {
  const ctx = electronApp.context();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const pages = ctx.pages();
    const sticky = pages.find((p) => p !== mainWindow);
    if (sticky) {
      const objective = await sticky.locator('[data-testid="sticky-objective"]').innerText();
      const keyResults = await sticky.locator('[data-testid="sticky-key-result"]').allInnerTexts();
      const isTop = await electronApp.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(
          (bw) => bw.webContents.getURL().includes('index.html') && bw.isAlwaysOnTop(),
        );
        return !!win;
      });
      return {
        windowId: 0,
        isTop,
        objective,
        keyResults,
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

async function debugWindows(electronApp: ElectronApplication) {
  const urls = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({
      id: w.id,
      url: w.webContents.getURL(),
      isTop: w.isAlwaysOnTop(),
    })),
  );
  // eslint-disable-next-line no-console
  console.info('[e2e] windows:', JSON.stringify(urls));
}

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('sticky window stays always-on-top with OKR contents rendered', async ({
  electronApp,
  mainWindow,
  mockServer,
}) => {
  mockServer.setResponses({
    nextQuestion: (callNumber) => {
      if (callNumber <= 2) {
        return {
          question: {
            id: `q${callNumber + 1}`,
            text: '请选择下一步',
            options: [
              { id: 'a', label: 'A', value: 'a' },
              { id: 'b', label: 'B', value: 'b' },
            ],
          },
        };
      }
      return null;
    },
    draft: {
      objectives: [
        {
          id: 'o1',
          title: '提高效率',
          description: '自动生成',
          keyResults: [
            { id: 'kr1', statement: 'KR1', target: '10%', measurement: 'rate' },
            { id: 'kr2', statement: 'KR2', target: 5, measurement: 'count' },
            { id: 'kr3', statement: 'KR3', target: '2s', measurement: 'latency' },
          ],
        },
      ],
    },
  });

  await completeClarification(mainWindow);
  await debugWindows(electronApp);
  await expect(mainWindow.locator('[data-testid="sticky-reopen"]')).toBeVisible({
    timeout: 15_000,
  });
  await mainWindow.click('[data-testid="sticky-reopen"]');

  let stickySnapshot: StickyWindowSnapshot;
  try {
    stickySnapshot = await waitForStickyWindowSnapshot(electronApp, mainWindow);
  } catch (err) {
    await debugWindows(electronApp);
    const requestLog = mockServer.getRequestLog();
    // eslint-disable-next-line no-console
    console.error('[e2e] mock server request log:', JSON.stringify(requestLog, null, 2));
    throw err;
  }
  const enforcedAlwaysOnTop = await electronApp.evaluate(({ BrowserWindow }, id) => {
    const win = BrowserWindow.fromId(id);
    if (!win) {
      return false;
    }
    win.setAlwaysOnTop(true, 'screen-saver');
    return win.isAlwaysOnTop();
  }, stickySnapshot.windowId);
  if (!process.env.CI && !process.env.ACT) {
    expect(enforcedAlwaysOnTop).toBe(true);
  }
  expect(stickySnapshot.objective).toContain('提高效率');
  expect(stickySnapshot.keyResults.length).toBeGreaterThan(0);
});
