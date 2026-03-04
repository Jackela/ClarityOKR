import { test, expect, cleanupPersistenceFiles } from '../../fixtures';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('shows error message when LLM API is unreachable', async ({ mainWindow, mockServer }) => {
  mockServer.setResponses({
    error: { status: 503, message: 'Service Unavailable' },
  });

  await mainWindow.waitForSelector('[data-testid="intent-input"]');
  await mainWindow.fill('[data-testid="intent-input"]', 'Test network error');
  await expect(mainWindow.locator('[data-testid="start-clarification"]')).toBeEnabled();
  await mainWindow.click('[data-testid="start-clarification"]');

  await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeVisible({
    timeout: 10000,
  });
  const errorElement = mainWindow.locator('[data-testid="error-message"]');
  await expect(errorElement).toBeVisible({ timeout: 15000 });
  await expect(errorElement).toContainText(/unavailable|error|failed/i);
});

test('shows retry button when network error occurs', async ({ mainWindow, mockServer }) => {
  mockServer.setResponses({
    error: { status: 503, message: 'Service Unavailable' },
  });

  await mainWindow.waitForSelector('[data-testid="intent-input"]');
  await mainWindow.fill('[data-testid="intent-input"]', 'Test retry button');
  await expect(mainWindow.locator('[data-testid="start-clarification"]')).toBeEnabled();
  await mainWindow.click('[data-testid="start-clarification"]');

  await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeVisible({
    timeout: 10000,
  });
  const retryButton = mainWindow.locator('[data-testid="retry-button"]');
  await expect(retryButton).toBeVisible({ timeout: 15000 });
  await expect(retryButton).toBeEnabled();
});

test('recovers when retry succeeds after initial network failure', async ({
  mainWindow,
  mockServer,
}) => {
  let failCount = 0;
  mockServer.setResponses({
    nextQuestion: () => {
      failCount += 1;
      if (failCount <= 1) {
        return null; // Signal error for first call
      }
      return {
        question: {
          id: 'q1',
          text: 'Test question',
          options: [
            { id: 'a', label: 'Option A', value: 'a' },
            { id: 'b', label: 'Option B', value: 'b' },
          ],
        },
      };
    },
  });

  await mainWindow.waitForSelector('[data-testid="intent-input"]');
  await mainWindow.fill('[data-testid="intent-input"]', 'Test retry recovery');
  await expect(mainWindow.locator('[data-testid="start-clarification"]')).toBeEnabled();
  await mainWindow.click('[data-testid="start-clarification"]');

  await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeVisible({
    timeout: 10000,
  });
  const retryButton = mainWindow.locator('[data-testid="retry-button"]');
  await expect(retryButton).toBeVisible({ timeout: 15000 });
  await expect(retryButton).toBeEnabled();

  // Reset responses to succeed on retry
  mockServer.setResponses({
    nextQuestion: () => ({
      question: {
        id: 'q1',
        text: 'Test question',
        options: [
          { id: 'a', label: 'Option A', value: 'a' },
          { id: 'b', label: 'Option B', value: 'b' },
        ],
      },
    }),
  });

  await retryButton.click();

  await expect(mainWindow.locator('[data-testid="clarification-loading"]')).toBeVisible({
    timeout: 10000,
  });
  const optionLocator = mainWindow.locator('[data-testid="clarification-option"]');
  await expect(optionLocator.first()).toBeVisible({ timeout: 15000 });
});
