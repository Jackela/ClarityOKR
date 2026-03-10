import { test, expect } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';
import {
  waitForElement,
  waitForErrorMessage,
  forceClick,
  waitForStateChange,
  waitForLoadingComplete,
  waitForErrorState,
} from '../../helpers/native-dom';

test('debug: verify error flow end-to-end', async ({ mainWindow, mockServer }) => {
  const clarification = new ClarificationPage(mainWindow);
  let callCount = 0;

  // Step 1: Configure Mock to return error on second call (after initial prompt)
  console.log('[DEBUG-TEST] Step 1: Configuring mock server');
  mockServer.setResponses({
    nextQuestion: () => {
      callCount++;
      console.log(`[DEBUG-TEST] Mock call #${callCount}`);
      if (callCount === 1) {
        // First call: return a question
        return {
          question: {
            id: 'q1',
            text: '测试问题',
            options: [
              { id: 'a', label: 'A', value: 'a' },
              { id: 'b', label: 'B', value: 'b' },
            ],
          },
        };
      }
      // Second call: return 503
      console.log('[DEBUG-TEST] Mock server returning 503');
      return null;
    },
  });

  // Step 2: Start clarification
  console.log('[DEBUG-TEST] Step 2: Starting clarification');
  await clarification.waitForReady();
  console.log('[DEBUG-TEST] Clarification page is ready');

  // Screenshot before starting
  await mainWindow.screenshot({ path: 'test-results/01-before-start.png', fullPage: true });
  console.log('[DEBUG-TEST] Screenshot saved: test-results/01-before-start.png');

  await clarification.startClarification('测试意图');
  console.log('[DEBUG-TEST] Started clarification with intent "测试意图"');

  // Wait for first question
  const questionVisible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
    timeout: 10000,
  });
  expect(questionVisible).toBe(true);
  console.log('[DEBUG-TEST] First question is visible');

  // Screenshot after starting
  await mainWindow.screenshot({ path: 'test-results/02-after-start.png', fullPage: true });
  console.log('[DEBUG-TEST] Screenshot saved: test-results/02-after-start.png');

  // Step 3: Answer the question to trigger error
  console.log('[DEBUG-TEST] Step 3: Answering question to trigger error');
  await forceClick(mainWindow, '[data-testid="clarification-option"]:first-child');

  // Step 4: FIX - Wait for loading to complete first, then wait for error state
  console.log('[DEBUG-TEST] Step 4: Waiting for loading to complete and error to appear...');

  // Use the new waitForErrorState helper that properly handles loading -> error transition
  const errorState = await waitForErrorState(mainWindow, {
    timeout: 20000,
    waitForRetryButton: true,
  });

  console.log('[DEBUG-TEST] Error state detected:', errorState);
  expect(errorState.hasError).toBe(true);

  // Step 5: Check DOM for error elements using native DOM
  console.log('[DEBUG-TEST] Step 5: Checking DOM for error elements');
  const errorCount = await mainWindow.evaluate(() => {
    return document.querySelectorAll('[data-testid="error-message"]').length;
  });
  console.log(`[DEBUG-TEST] Error container count: ${errorCount}`);

  // Step 6: Check retry button with screenshots
  console.log('[DEBUG-TEST] Step 6: Checking retry button');
  await mainWindow.screenshot({ path: 'test-results/06-before-retry-check.png', fullPage: true });
  console.log('[DEBUG-TEST] Screenshot saved: test-results/06-before-retry-check.png');

  const hasRetry = errorState.hasRetryButton;
  console.log('[DEBUG-TEST] Has retry button:', hasRetry);

  // Final screenshot after check
  await mainWindow.screenshot({
    path: `test-results/07-check-retry-${hasRetry}.png`,
    fullPage: true,
  });
  console.log(`[DEBUG-TEST] Screenshot saved: test-results/07-check-retry-${hasRetry}.png`);

  if (hasRetry) {
    console.log('[DEBUG-TEST] Retry button is visible!');
  } else {
    console.log('[DEBUG-TEST] Retry button NOT found - checking DOM directly');
    const retryCount = await mainWindow.evaluate(() => {
      return document.querySelectorAll('[data-testid="retry-button"]').length;
    });
    console.log(`[DEBUG-TEST] Retry button count in DOM: ${retryCount}`);
    // Take final DOM check screenshot
    await mainWindow.screenshot({ path: 'test-results/08-dom-check-failed.png', fullPage: true });
    console.log('[DEBUG-TEST] Screenshot saved: test-results/08-dom-check-failed.png');
  }

  // Step 7: Get console logs from renderer
  console.log('[DEBUG-TEST] Step 7: Collecting console logs');
  const logs = await mainWindow.evaluate(() => {
    return {
      location: window.location.href,
      timestamp: Date.now(),
    };
  });
  console.log('[DEBUG-TEST] Page info:', logs);

  // Verification
  console.log('[DEBUG-TEST] Final verification:');
  console.log('  - Error visible: true');
  console.log('  - Has retry button:', hasRetry);

  expect(hasRetry).toBe(true);
});

test('debug: verify error to success flow', async ({ mainWindow, mockServer }) => {
  const clarification = new ClarificationPage(mainWindow);
  let callCount = 0;

  console.log('[DEBUG-TEST] Testing error -> retry -> success flow');

  // First call returns question, second returns 503, third returns success
  mockServer.setResponses({
    nextQuestion: () => {
      callCount++;
      console.log(`[DEBUG-TEST] Mock call #${callCount}`);
      if (callCount === 1) {
        console.log('[DEBUG-TEST] Returning first question');
        return {
          question: {
            id: 'q1',
            text: 'First question',
            options: [
              { id: 'opt1', label: 'Option A', value: 'opt1' },
              { id: 'opt2', label: 'Option B', value: 'opt2' },
            ],
          },
        };
      }
      if (callCount === 2) {
        console.log('[DEBUG-TEST] Returning 503 (error)');
        return null;
      }
      console.log('[DEBUG-TEST] Returning success (retry)');
      return {
        question: {
          id: 'q2',
          text: 'What is your primary goal?',
          options: [
            { id: 'opt3', label: 'Option C', value: 'opt3' },
            { id: 'opt4', label: 'Option D', value: 'opt4' },
          ],
        },
      };
    },
  });

  // Start clarification
  await clarification.waitForReady();
  await clarification.startClarification('测试目标');

  // Wait for first question
  const question1Visible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
    timeout: 10000,
  });
  expect(question1Visible).toBe(true);

  // Answer to trigger error
  await forceClick(mainWindow, '[data-testid="clarification-option"]:first-child');

  // FIX: Wait for loading to complete first, then wait for error
  console.log('[DEBUG-TEST] Waiting for loading to complete and error to appear...');
  await waitForLoadingComplete(mainWindow, { maxWaitTime: 15000 });

  // Now wait for error message
  await waitForStateChange(mainWindow, {
    to: '[data-testid="error-message"]',
    timeout: 10000,
  });
  console.log('[DEBUG-TEST] Error is visible');

  // Additional wait for button stabilization
  await mainWindow.waitForTimeout(500);

  // Click retry using forceClick
  console.log('[DEBUG-TEST] Clicking retry button');
  await forceClick(mainWindow, '[data-testid="retry-button"]');

  // Wait for success using native DOM - wait for loading to complete first
  console.log('[DEBUG-TEST] Waiting for retry loading to complete...');
  await waitForLoadingComplete(mainWindow, { maxWaitTime: 15000 });

  console.log('[DEBUG-TEST] Waiting for success (question to appear)...');
  const question2Visible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
    timeout: 10000,
  });
  console.log('[DEBUG-TEST] Success! Question is now visible');
  expect(question2Visible).toBe(true);

  const question = await clarification.getCurrentQuestion();
  console.log('[DEBUG-TEST] Question:', question);

  expect(question).toContain('goal');
});

test('debug: log all state changes', async ({ mainWindow, mockServer }) => {
  const clarification = new ClarificationPage(mainWindow);
  let callCount = 0;

  console.log('[DEBUG-TEST] Setting up state monitoring');

  // Inject monitoring script
  await mainWindow.evaluate(() => {
    (window as unknown as { __debugLogs: string[] }).__debugLogs = [];

    // Monitor console.log calls
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      const logEntry = `[${new Date().toISOString()}] ${args.join(' ')}`;
      (window as unknown as { __debugLogs: string[] }).__debugLogs.push(logEntry);
      originalLog.apply(console, args);
    };
  });

  mockServer.setResponses({
    nextQuestion: () => {
      callCount++;
      if (callCount === 1) {
        return {
          question: {
            id: 'q1',
            text: 'Test question',
            options: [
              { id: 'a', label: 'A', value: 'a' },
              { id: 'b', label: 'B', value: 'b' },
            ],
          },
        };
      }
      return null; // 503 on second call
    },
  });

  console.log('[DEBUG-TEST] Starting clarification flow');
  await clarification.waitForReady();
  await clarification.startClarification('测试意图');

  // Wait for first question
  const questionVisible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
    timeout: 10000,
  });
  expect(questionVisible).toBe(true);

  // Answer to trigger error
  await forceClick(mainWindow, '[data-testid="clarification-option"]:first-child');

  // FIX: Wait for loading to complete before checking error state
  console.log('[DEBUG-TEST] Waiting for loading to complete...');
  await waitForLoadingComplete(mainWindow, { maxWaitTime: 15000 });

  console.log('[DEBUG-TEST] Waiting 5 seconds for state changes...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Retrieve logs
  const logs = await mainWindow.evaluate(() => {
    return (window as unknown as { __debugLogs: string[] }).__debugLogs;
  });

  console.log('[DEBUG-TEST] === Collected Logs ===');
  logs.forEach((log) => console.log(log));
  console.log('[DEBUG-TEST] === End Logs ===');

  // Check state using native DOM
  const errorCount = await mainWindow.evaluate(() => {
    return document.querySelectorAll('[data-testid="error-message"]').length;
  });
  console.log('[DEBUG-TEST] Final error element count:', errorCount);
  expect(errorCount).toBeGreaterThan(0);
});
