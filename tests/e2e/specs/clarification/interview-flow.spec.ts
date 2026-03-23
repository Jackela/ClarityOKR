import { workerTest as test, expect } from '../../fixtures/worker-fixtures';
import { cleanupPersistenceFiles } from '../../fixtures';
import { waitForText, clickGenerateButton } from '../../helpers/native-dom';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('completes interview and enables OKR generation', async ({ mainWindow, mockServer }) => {
  // Wait for app to fully load
  await mainWindow.waitForLoadState('domcontentloaded');
  await mainWindow.waitForTimeout(1000); // Give Angular time to bootstrap

  // Configure mock
  const mockConfig: MockResponseConfig = {
    nextQuestion: (callNumber) => {
      console.log(`[mock] nextQuestion called with callNumber=${callNumber}`);
      if (callNumber <= 2) {
        return {
          question: {
            id: `q${callNumber + 1}`,
            text: '再补充一个细节',
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
              { id: 'kr2', statement: 'KR2', target: '20%', measurement: 'rate' },
              { id: 'kr3', statement: 'KR3', target: '30%', measurement: 'rate' },
            ],
          },
        ],
      },
    },
  };

  await mockServer.setResponses(mockConfig);
  console.log('[test] Mock responses configured');

  // Fill the input using JavaScript and dispatch input event
  await mainWindow.evaluate(() => {
    const input = document.querySelector('[data-testid="intent-input"]') as HTMLInputElement;
    if (input) {
      input.value = '提高效率';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  console.log('[test] Filled intent input via JS');

  // Click the submit button directly via JavaScript
  await mainWindow.evaluate(() => {
    const button = document.querySelector(
      '[data-testid="start-clarification"]',
    ) as HTMLButtonElement;
    if (button) {
      button.click();
    }
  });
  console.log('[test] Clicked start-clarification via JS');

  // Wait for the request to be sent
  await mainWindow.waitForTimeout(1000);

  // Check what was sent to mock server
  const requestLog = mockServer.getRequestLog();
  console.log('[test] Request log after start:', JSON.stringify(requestLog, null, 2));

  // Debug: Check if Angular is even running
  const debugInfo = await mainWindow.evaluate(() => {
    return {
      hasNg: typeof (window as unknown as { ng?: unknown }).ng !== 'undefined',
      hasZone: typeof (window as unknown as { Zone?: unknown }).Zone !== 'undefined',
      formExists: !!document.querySelector('.intent-form'),
      buttonExists: !!document.querySelector('[data-testid="start-clarification"]'),
      inputValue: (document.querySelector('[data-testid="intent-input"]') as HTMLInputElement)
        ?.value,
    };
  });
  console.log('[test] Debug info:', JSON.stringify(debugInfo));

  // If request was sent, proceed with the flow
  if (requestLog.length > 0) {
    console.log('[test] IPC request was sent, waiting for question...');

    // Wait for first question
    const questionVisible = await mainWindow
      .waitForSelector('[data-testid="prompt-question"]', { state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    console.log('[test] Question visible:', questionVisible);
    expect(questionVisible).toBe(true);

    // Answer first question
    await mainWindow.evaluate(() => {
      const option = document.querySelector('[data-testid="clarification-option"]') as HTMLElement;
      option?.click();
    });
    console.log('[test] Answered first question');

    // Wait for second question
    const secondQuestionVisible = await waitForText(
      mainWindow,
      '[data-testid="prompt-question"]',
      '再补充',
      10000,
    );
    expect(secondQuestionVisible).toBe(true);

    // Answer second question
    await mainWindow.evaluate(() => {
      const option = document.querySelector('[data-testid="clarification-option"]') as HTMLElement;
      option?.click();
    });
    console.log('[test] Answered second question');

    // Click generate button
    await clickGenerateButton(mainWindow, 15000);
    console.log('[test] Clicked generate button');

    // Verify OKR generated
    const okrText = await waitForText(mainWindow, '[data-testid="okr-summary"]', '提高效率', 15000);
    expect(okrText).toBe(true);
  } else {
    // If no request was sent, fail with debug info
    expect(requestLog.length).toBeGreaterThan(0);
  }
});
