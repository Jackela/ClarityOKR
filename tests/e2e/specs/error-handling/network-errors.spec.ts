import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('shows error message when LLM API is unreachable', async ({ mainWindow, mockServer }) => {
  const clarification = new ClarificationPage(mainWindow);

  mockServer.setResponses({
    error: { status: 503, message: 'Service Unavailable' },
  });

  await clarification.waitForReady();
  await clarification.startClarification('Test network error');

  await expect(await clarification.hasError()).toBe(true);
  const errorText = await clarification.getErrorText();
  expect(errorText.toLowerCase()).toMatch(/unavailable|error|failed/i);
});

test('shows retry button when network error occurs', async ({ mainWindow, mockServer }) => {
  const clarification = new ClarificationPage(mainWindow);

  mockServer.setResponses({
    error: { status: 503, message: 'Service Unavailable' },
  });

  await clarification.waitForReady();
  await clarification.startClarification('Test retry button');

  await expect(await clarification.error.hasRetryButton()).toBe(true);
});

test('recovers when retry succeeds after initial network failure', async ({
  mainWindow,
  mockServer,
}) => {
  const clarification = new ClarificationPage(mainWindow);

  let failCount = 0;
  mockServer.setResponses({
    nextQuestion: () => {
      failCount += 1;
      if (failCount <= 1) {
        return null; // Signal error for first call
      }
      return {
        prompt: {
          id: 'q1',
          question: 'Test question',
          sequence: 0,
          context: 'LLM generated',
          options: [
            { id: 'a', label: 'Option A', value: 'a' },
            { id: 'b', label: 'Option B', value: 'b' },
          ],
        },
      };
    },
  });

  await clarification.waitForReady();
  await clarification.startClarification('Test retry recovery');

  await expect(await clarification.error.hasRetryButton()).toBe(true);

  // Reset responses to succeed on retry
  mockServer.setResponses({
    nextQuestion: () => ({
      prompt: {
        id: 'q1',
        question: 'Test question',
        sequence: 0,
        context: 'LLM generated',
        options: [
          { id: 'a', label: 'Option A', value: 'a' },
          { id: 'b', label: 'Option B', value: 'b' },
        ],
      },
    }),
  });

  await clarification.retry();

  await clarification.waitForOptions();
});
