import { test, expect, cleanupPersistenceFiles } from '../../fixtures';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('clarification interview completes and enables OKR generation', async ({
  mainWindow,
  mockServer,
}) => {
  mockServer.setResponses({
    nextQuestion: (callNumber) => {
      if (callNumber <= 2) {
        return {
          question: {
            id: `q${callNumber + 1}`,
            text: '再补充一个细节',
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

  await mainWindow.waitForSelector('[data-testid="intent-input"]');
  await mainWindow.fill('[data-testid="intent-input"]', '提高效率');
  const intentValue = await mainWindow.inputValue('[data-testid="intent-input"]');
  // eslint-disable-next-line no-console
  console.info('[e2e] intent input captured value:', intentValue);
  await expect(mainWindow.locator('[data-testid="start-clarification"]')).toBeEnabled();
  await mainWindow.click('[data-testid="start-clarification"]');

  await mainWindow.waitForSelector('[data-testid="clarification-option"]', { timeout: 15_000 });

  const optionLocator = mainWindow.locator('[data-testid="clarification-option"]');
  await optionLocator.first().click();
  await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeVisible({
    timeout: 5000,
  });
  await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeHidden({
    timeout: 30000,
  });
  await mainWindow.waitForSelector('[data-testid="clarification-option"]', { timeout: 5000 });

  await mainWindow.waitForFunction(() => {
    const el = document.querySelector('[data-testid="prompt-question"]');
    return !!el && el.textContent?.includes('再补充');
  });
  await optionLocator.last().click();

  const generateButton = mainWindow.locator('[data-testid="clarification-generate"]');
  await expect(generateButton).toBeEnabled();
  await generateButton.click();

  const okrSummary = mainWindow.locator('[data-testid="okr-summary"]');
  await expect(okrSummary).toBeVisible();
  await expect(okrSummary).toContainText('提高效率');
});
