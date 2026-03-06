import { test, expect } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';

test('debug: verify error flow end-to-end', async ({ mainWindow, mockServer }) => {
  const clarification = new ClarificationPage(mainWindow);

  // Step 1: Configure Mock to return 503
  console.log('[DEBUG-TEST] Step 1: Configuring mock server to return 503');
  mockServer.setResponses({
    nextQuestion: () => {
      console.log('[DEBUG-TEST] Mock server returning 503');
      return null; // null triggers 503
    },
  });

  // Step 2: Start clarification
  console.log('[DEBUG-TEST] Step 2: Starting clarification');
  await clarification.waitForReady();
  console.log('[DEBUG-TEST] Clarification page is ready');

  // Screenshot before starting
  await mainWindow.screenshot({ path: 'test-results/01-before-start.png', fullPage: true });
  console.log('[DEBUG-TEST] Screenshot saved: test-results/01-before-start.png');

  await clarification.startClarification('测试');
  console.log('[DEBUG-TEST] Started clarification with intent "测试"');

  // Screenshot after starting
  await mainWindow.screenshot({ path: 'test-results/02-after-start.png', fullPage: true });
  console.log('[DEBUG-TEST] Screenshot saved: test-results/02-after-start.png');

  // Step 3: Wait for error state with incremental screenshots
  console.log('[DEBUG-TEST] Step 3: Waiting for error state (max 10s)...');
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await mainWindow.screenshot({ path: 'test-results/03-after-wait-2s.png', fullPage: true });
  console.log('[DEBUG-TEST] Screenshot saved: test-results/03-after-wait-2s.png');

  await new Promise((resolve) => setTimeout(resolve, 3000));
  await mainWindow.screenshot({ path: 'test-results/04-after-wait-5s.png', fullPage: true });
  console.log('[DEBUG-TEST] Screenshot saved: test-results/04-after-wait-5s.png');

  // Step 4: Take screenshot before checks
  console.log('[DEBUG-TEST] Step 4: Taking screenshot before DOM checks');
  await mainWindow.screenshot({ path: 'test-results/05-before-dom-check.png', fullPage: true });
  console.log('[DEBUG-TEST] Screenshot saved: test-results/05-before-dom-check.png');

  // Step 5: Check DOM for error elements
  console.log('[DEBUG-TEST] Step 5: Checking DOM for error elements');
  const errorContainer = mainWindow.locator('[data-testid="error-message"]');
  const errorCount = await errorContainer.count();
  console.log(`[DEBUG-TEST] Error container count: ${errorCount}`);

  const errorVisible = await clarification.error.isVisible();
  console.log('[DEBUG-TEST] Error visible:', errorVisible);

  if (errorVisible) {
    const errorText = await clarification.error.getText();
    console.log('[DEBUG-TEST] Error text:', errorText);
  }

  // Step 6: Check retry button with screenshots
  console.log('[DEBUG-TEST] Step 6: Checking retry button');
  await mainWindow.screenshot({ path: 'test-results/06-before-retry-check.png', fullPage: true });
  console.log('[DEBUG-TEST] Screenshot saved: test-results/06-before-retry-check.png');

  const hasRetry = await clarification.error.hasRetryButton();
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
    const retryButton = mainWindow.locator('[data-testid="retry-button"]');
    const retryCount = await retryButton.count();
    console.log(`[DEBUG-TEST] Retry button count in DOM: ${retryCount}`);
    // Take final DOM check screenshot
    await mainWindow.screenshot({ path: 'test-results/08-dom-check-failed.png', fullPage: true });
    console.log('[DEBUG-TEST] Screenshot saved: test-results/08-dom-check-failed.png');
  }

  // Step 7: Get console logs from renderer
  console.log('[DEBUG-TEST] Step 7: Collecting console logs');
  const logs = await mainWindow.evaluate(() => {
    // This won't capture past logs, but we can check current state
    return {
      location: window.location.href,
      timestamp: Date.now(),
    };
  });
  console.log('[DEBUG-TEST] Page info:', logs);

  // Verification
  console.log('[DEBUG-TEST] Final verification:');
  console.log('  - Error visible:', errorVisible);
  console.log('  - Has retry button:', hasRetry);

  expect(hasRetry).toBe(true);
});

test('debug: verify error to success flow', async ({ mainWindow, mockServer }) => {
  const clarification = new ClarificationPage(mainWindow);
  let callCount = 0;

  console.log('[DEBUG-TEST] Testing error -> retry -> success flow');

  // First call returns 503, second returns success
  mockServer.setResponses({
    nextQuestion: () => {
      callCount++;
      console.log(`[DEBUG-TEST] Mock call #${callCount}`);
      if (callCount === 1) {
        console.log('[DEBUG-TEST] Returning 503 (first call)');
        return null;
      }
      console.log('[DEBUG-TEST] Returning success (retry)');
      return {
        prompt: {
          id: 'q1',
          question: 'What is your primary goal?',
          context: 'Please select an option',
          options: [
            { id: 'opt1', label: 'Option A', description: 'First option' },
            { id: 'opt2', label: 'Option B', description: 'Second option' },
          ],
        },
      };
    },
  });

  // Start clarification
  await clarification.waitForReady();
  await clarification.startClarification('测试目标');

  // Wait for error
  console.log('[DEBUG-TEST] Waiting for error...');
  await clarification.error.waitForVisible(5000);
  console.log('[DEBUG-TEST] Error is visible');

  // Click retry
  console.log('[DEBUG-TEST] Clicking retry button');
  await clarification.retry();

  // Wait for success
  console.log('[DEBUG-TEST] Waiting for success (question to appear)...');
  await clarification.waitForQuestion(5000);
  console.log('[DEBUG-TEST] Success! Question is now visible');

  const question = await clarification.getCurrentQuestion();
  console.log('[DEBUG-TEST] Question:', question);

  expect(question).toContain('goal');
});

test('debug: log all state changes', async ({ mainWindow, mockServer }) => {
  const clarification = new ClarificationPage(mainWindow);

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
    nextQuestion: () => null, // 503
  });

  console.log('[DEBUG-TEST] Starting clarification flow');
  await clarification.waitForReady();
  await clarification.startClarification('测试');

  console.log('[DEBUG-TEST] Waiting 5 seconds for state changes...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Retrieve logs
  const logs = await mainWindow.evaluate(() => {
    return (window as unknown as { __debugLogs: string[] }).__debugLogs;
  });

  console.log('[DEBUG-TEST] === Collected Logs ===');
  logs.forEach((log) => console.log(log));
  console.log('[DEBUG-TEST] === End Logs ===');

  // Check state
  const errorVisible = await clarification.error.isVisible();
  console.log('[DEBUG-TEST] Final error state:', errorVisible);
});
