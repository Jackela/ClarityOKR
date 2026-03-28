import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import {
  ClarificationPage,
  OkrStickyPage,
  waitForStickyWindow,
  debugWindows,
  findStickyWindow,
} from '../../page-objects';
import { waitForElement, forceClick } from '../../helpers/native-dom';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('user can reopen sticky window after closing it', async ({
  electronApp,
  mainWindow,
  mockServer,
}) => {
  const clarification = new ClarificationPage(mainWindow);

  const mockConfig: MockResponseConfig = {
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
    },
  };
  mockServer.setResponses(mockConfig);

  await clarification.waitForReady();
  await clarification.completeClarificationFlow('提高效率', {
    questionCount: 2,
    selectOptionIndex: 0,
    finalOptionIndex: 1,
  });

  // Wait for OKR summary to be visible with text
  await clarification.waitForOkrSummary(30000);
  const okrText = await clarification.getOkrSummaryText();
  expect(okrText).toContain('提高');

  await debugWindows(electronApp);

  // 使用原生DOM等待按钮可见
  const reopenBtnVisible = await waitForElement(mainWindow, '[data-testid="sticky-reopen"]', {
    timeout: 10000,
  });
  expect(reopenBtnVisible).toBe(true);

  await forceClick(mainWindow, '[data-testid="sticky-reopen"]');

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

  // Capture the initial OKR content for comparison
  const initialObjective = await initialSticky.getObjective();
  const initialKeyResults = await initialSticky.getKeyResults();

  // Close sticky window
  await initialSticky.close();

  // Reopen sticky window again - 使用原生DOM等待按钮
  const reopenBtnVisible2 = await waitForElement(mainWindow, '[data-testid="sticky-reopen"]', {
    timeout: 10000,
  });
  expect(reopenBtnVisible2).toBe(true);

  await forceClick(mainWindow, '[data-testid="sticky-reopen"]');

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

  // Verify content is preserved - same OKR data is displayed
  const reopenedObjective = await reopenedSticky.getObjective();
  expect(reopenedObjective).toContain('提高效率');
  expect(reopenedObjective).toBe(initialObjective); // Exact match

  const reopenedKeyResults = await reopenedSticky.getKeyResults();
  expect(reopenedKeyResults.length).toBeGreaterThan(0);
  expect(reopenedKeyResults).toEqual(initialKeyResults); // Exact match
});

test('reopening sticky window without OKR shows appropriate message', async ({
  electronApp,
  mainWindow,
}) => {
  // Start app but don't generate OKR - just wait for app to be ready
  await mainWindow.waitForLoadState('domcontentloaded');

  // Wait for reopen button to be visible using deterministic wait
  const reopenBtnVisible = await waitForElement(mainWindow, '[data-testid="sticky-reopen"]', {
    timeout: 10000,
  });
  expect(reopenBtnVisible).toBe(true);

  // Click reopen button without any OKR generated
  await forceClick(mainWindow, '[data-testid="sticky-reopen"]');

  // In the absence of an OKR, the app should handle gracefully.
  // The expected behavior (to be implemented in T033):
  // - Show an error/toast message, OR
  // - Show the sticky window with empty/no data state

  // Use deterministic wait pattern: poll for expected states
  const startTime = Date.now();
  const timeout = 8000;
  let errorVisible = false;
  let stickyWindow = null;

  while (Date.now() - startTime < timeout) {
    // Check if error message appeared
    errorVisible = await waitForElement(mainWindow, '[data-testid="error-message"]', {
      timeout: 500,
    }).catch(() => false);
    if (errorVisible) break;

    // Check if sticky window opened
    stickyWindow = await findStickyWindow(electronApp, { timeout: 500 }).catch(() => null);
    if (stickyWindow) break;

    // Small poll interval
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (stickyWindow) {
    // If sticky opened, verify it shows empty/no data state
    const stickyPage = new OkrStickyPage(stickyWindow);
    const objective = await stickyPage.getObjective().catch(() => '');
    // Should show placeholder or empty message
    expect(objective.length === 0 || objective.includes('无') || objective.includes('请')).toBe(
      true,
    );
  } else if (!errorVisible) {
    // If no sticky and no error, the reopen handler should handle gracefully
    // This is the expected behavior - the handler will be implemented in T033
    // For now, this test documents the expected behavior and will fail until implemented
    throw new Error(
      'Expected error message or sticky window with empty state. ' +
        'The sticky:reopen handler needs to be implemented (T033).',
    );
  }
});
