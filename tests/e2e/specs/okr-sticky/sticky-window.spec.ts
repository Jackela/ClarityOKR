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

test('sticky window stays always-on-top with OKR contents rendered', async ({
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

  // Wait for sticky window
  let stickyPage;
  try {
    stickyPage = await waitForStickyWindow(electronApp);
  } catch (err) {
    await debugWindows(electronApp);
    const requestLog = mockServer.getRequestLog();
    // eslint-disable-next-line no-console
    console.error('[e2e] mock server request log:', JSON.stringify(requestLog, null, 2));
    throw err;
  }

  const sticky = new OkrStickyPage(stickyPage);

  // Verify sticky window content
  await sticky.waitForReady();
  const objective = await sticky.getObjective();
  expect(objective).toContain('提高效率');

  const keyResults = await sticky.getKeyResults();
  expect(keyResults.length).toBeGreaterThan(0);

  // Verify always-on-top (skip in CI)
  if (!process.env.CI && !process.env.ACT) {
    const isAlwaysOnTop = await sticky.isAlwaysOnTop(electronApp);
    expect(isAlwaysOnTop).toBe(true);
  }
});
