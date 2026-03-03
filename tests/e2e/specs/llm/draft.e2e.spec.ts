import { test, expect, cleanupPersistenceFiles } from '../../fixtures';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('LLM draft generation persists and displays OKR', async ({ mainWindow, mockServer }) => {
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
          title: '提高执行力',
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
  await mainWindow.click('[data-testid="start-clarification"]');
  await mainWindow.waitForSelector('[data-testid="clarification-option"]');
  await mainWindow.locator('[data-testid="clarification-option"]').first().click();
  await mainWindow.waitForSelector('[data-testid="clarification-loading"]', { timeout: 5000 });
  await mainWindow.waitForSelector('[data-testid="clarification-loading"]', {
    state: 'hidden',
    timeout: 30_000,
  });
  await mainWindow.locator('[data-testid="clarification-option"]').last().click();

  const generateButton = mainWindow.locator('[data-testid="clarification-generate"]');
  await expect(generateButton).toBeEnabled();
  await generateButton.click();

  const okrSummary = mainWindow.locator('[data-testid="okr-summary"]');
  try {
    await expect(okrSummary).toBeVisible({ timeout: 45_000 });
  } catch (err) {
    const content = await mainWindow.content();
    // eslint-disable-next-line no-console
    console.error('[e2e] window content on failure:', content);
    const requestLog = mockServer.getRequestLog();
    // eslint-disable-next-line no-console
    console.error('[e2e] mock server request log:', JSON.stringify(requestLog, null, 2));
    throw err;
  }
  const summaryText = await okrSummary.innerText();
  expect(summaryText.includes('提高执行力') || summaryText.includes('提高效率')).toBeTruthy();
});
