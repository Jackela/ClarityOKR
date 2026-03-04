import {
  test,
  expect,
  cleanupPersistenceFiles,
  findStickyWindow,
  ElectronApplication,
  Page,
} from '../../fixtures';

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

  const loadingLocator = mainWindow.locator('[data-testid="clarification-loading"]');
  await expect(loadingLocator).toBeVisible({ timeout: 10_000 });
  await expect(loadingLocator).toBeHidden({ timeout: 15_000 });

  await expect(optionLocator.last()).toBeVisible({ timeout: 15_000 });
  await optionLocator.last().click();

  const generateButton = mainWindow.locator('[data-testid="clarification-generate"]');
  await expect(generateButton).toBeEnabled({ timeout: 15_000 });
  await generateButton.click();
}

async function waitForStickyWindow(
  electronApp: ElectronApplication,
  mainWindow: Page,
): Promise<Page> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const sticky = await findStickyWindow(electronApp);
    if (sticky && sticky !== mainWindow) return sticky;
    await new Promise((resolve) => setTimeout(resolve, 500));
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

test('user can reopen sticky window after closing it', async ({
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

  let initialStickyWindow: Page;
  try {
    initialStickyWindow = await waitForStickyWindow(electronApp, mainWindow);
  } catch (err) {
    await debugWindows(electronApp);
    const requestLog = mockServer.getRequestLog();
    // eslint-disable-next-line no-console
    console.error('[e2e] mock server request log:', JSON.stringify(requestLog, null, 2));
    throw err;
  }

  await initialStickyWindow.close();

  await expect(mainWindow.locator('[data-testid="sticky-reopen"]')).toBeVisible();
  await mainWindow.click('[data-testid="sticky-reopen"]');

  let reopenedStickyWindow: Page;
  try {
    reopenedStickyWindow = await waitForStickyWindow(electronApp, mainWindow);
  } catch (err) {
    await debugWindows(electronApp);
    throw err;
  }
  await expect(reopenedStickyWindow.locator('[data-testid="sticky-objective"]')).toContainText(
    '提高效率',
  );
  const kr = await reopenedStickyWindow
    .locator('[data-testid="sticky-key-result"]')
    .allInnerTexts();
  expect(kr.length).toBeGreaterThan(0);
});
