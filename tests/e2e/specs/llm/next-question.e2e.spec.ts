import { test, expect } from '../../fixtures';

test('LLM next-question updates prompt after selection', async ({ mainWindow, mockServer }) => {
  mockServer.setResponses({
    nextQuestion: () => ({
      question: {
        id: 'q2',
        text: '请选择下一步',
        options: [
          { id: 'a', label: 'A', value: 'a' },
          { id: 'b', label: 'B', value: 'b' },
        ],
      },
    }),
  });

  await mainWindow.waitForSelector('[data-testid="intent-input"]');
  await mainWindow.fill('[data-testid="intent-input"]', '提高效率');
  await mainWindow.click('[data-testid="start-clarification"]');
  await mainWindow.waitForSelector('[data-testid="clarification-option"]');
  await mainWindow.locator('[data-testid="clarification-option"]').first().click();
  await mainWindow.waitForSelector('[data-testid="clarification-loading"]', { timeout: 5000 });
  await mainWindow.waitForSelector('[data-testid="clarification-loading"]', {
    state: 'hidden',
    timeout: 15_000,
  });
  await mainWindow.waitForSelector('[data-testid="clarification-option"]', { timeout: 5000 });

  const text = await mainWindow.locator('[data-testid="prompt-question"]').first().innerText();
  expect(text.includes('请选择下一步') || text.includes('再补充')).toBeTruthy();
});
