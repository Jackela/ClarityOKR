import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import {
  ClarificationPage,
  OkrStickyPage,
  waitForStickyWindow,
  debugWindows,
} from '../../page-objects';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('user can reopen sticky window after closing it', async ({
  electronApp,
  mainWindow,
  mockServer,
}) => {
  const clarification = new ClarificationPage(mainWindow);

  mockServer.setResponses({
    nextQuestion: (callNumber) => {
      if (callNumber <= 2) {
        return {
          prompt: {
            id: `q${callNumber + 1}`,
            question: '请选择下一步',
            sequence: callNumber - 1,
            context: 'LLM generated',
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

  await clarification.waitForReady();
  await clarification.completeClarificationFlow('提高效率', {
    questionCount: 2,
    selectOptionIndex: 0,
    finalOptionIndex: 1,
  });

  await debugWindows(electronApp);

  // Reopen sticky window
  await clarification.okrSummary.waitFor();
  const reopenBtn = mainWindow.locator('[data-testid="sticky-reopen"]');
  await expect(reopenBtn).toBeVisible();
  await reopenBtn.click();

  // Get initial sticky window
  let initialStickyPage;
  try {
    initialStickyPage = await waitForStickyWindow(electronApp);
  } catch (err) {
    await debugWindows(electronApp);
    const requestLog = mockServer.getRequestLog();
    // eslint-disable-next-line no-console
    console.error('[e2e] mock server request log:', JSON.stringify(requestLog, null, 2));
    throw err;
  }

  const initialSticky = new OkrStickyPage(initialStickyPage);
  await initialSticky.waitForReady();

  // Close sticky window
  await initialSticky.close();

  // Reopen sticky window again
  await expect(reopenBtn).toBeVisible();
  await reopenBtn.click();

  // Get reopened sticky window
  let reopenedStickyPage;
  try {
    reopenedStickyPage = await waitForStickyWindow(electronApp);
  } catch (err) {
    await debugWindows(electronApp);
    throw err;
  }

  const reopenedSticky = new OkrStickyPage(reopenedStickyPage);
  await reopenedSticky.waitForReady();

  // Verify content is preserved
  const objective = await reopenedSticky.getObjective();
  expect(objective).toContain('提高效率');

  const keyResults = await reopenedSticky.getKeyResults();
  expect(keyResults.length).toBeGreaterThan(0);
});
