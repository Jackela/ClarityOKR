import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';

test.describe('Invalid LLM Response Handling', () => {
  test.beforeEach(async () => {
    await cleanupPersistenceFiles();
  });

  test('handles malformed JSON response gracefully', async ({ mainWindow, mockServer }) => {
    const clarification = new ClarificationPage(mainWindow);

    mockServer.setResponses({
      rawResponse: '{ invalid json }',
    });

    await clarification.waitForReady();
    await clarification.startClarification('提高效率');

    await expect(await clarification.hasError()).toBe(true);
    const errorText = await clarification.getErrorText();
    expect(errorText.toLowerCase()).toMatch(/(error|failed|invalid|malformed)/);
  });

  test('handles missing required fields gracefully', async ({ mainWindow, mockServer }) => {
    const clarification = new ClarificationPage(mainWindow);

    mockServer.setResponses({
      rawResponse: JSON.stringify({ question: { id: 'q1' } }),
    });

    await clarification.waitForReady();
    await clarification.startClarification('提高效率');

    await expect(await clarification.hasError()).toBe(true);
    const errorText = await clarification.getErrorText();
    expect(errorText.toLowerCase()).toMatch(/(error|failed|missing|invalid)/);
  });

  test('handles empty response gracefully', async ({ mainWindow, mockServer }) => {
    const clarification = new ClarificationPage(mainWindow);

    mockServer.setResponses({
      rawResponse: '',
    });

    await clarification.waitForReady();
    await clarification.startClarification('提高效率');

    await expect(await clarification.hasError()).toBe(true);
    const errorText = await clarification.getErrorText();
    expect(errorText.toLowerCase()).toMatch(/(error|failed|empty|no.*response)/);
  });
});
