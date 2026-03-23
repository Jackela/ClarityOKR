import { workerTest as test, expect } from '../../fixtures/worker-fixtures';
import { cleanupPersistenceFiles } from '../../fixtures';
import {
  waitForElement,
  waitForText,
  forceClick,
  clickGenerateButton,
} from '../../helpers/native-dom';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('completes interview and enables OKR generation', async ({ mainWindow, mockServer }) => {
  // Wait for app to fully load
  await mainWindow.waitForLoadState('domcontentloaded');

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

  // Wait for any pending requests before setting responses
  await mockServer.setResponses(mockConfig);

  console.log('[test] Mock responses configured');
  console.log('[test] Mock server URL:', mockServer.url);

  // 1. Fill intent and start
  await mainWindow.fill('[data-testid="intent-input"]', '提高效率');
  console.log('[test] Filled intent input');

  // Check if button is enabled after filling
  const buttonEnabled = await mainWindow.evaluate(() => {
    const btn = document.querySelector('[data-testid="start-clarification"]') as HTMLButtonElement;
    return btn && !btn.disabled;
  });
  console.log('[test] Button enabled after fill:', buttonEnabled);

  await mainWindow.click('[data-testid="start-clarification"]');
  console.log('[test] Clicked start-clarification');

  // Wait a bit for the request to be sent
  await mainWindow.waitForTimeout(1000);

  // Check what was sent to mock server
  const requestLog = mockServer.getRequestLog();
  console.log('[test] Request log after start:', JSON.stringify(requestLog, null, 2));

  // 2. Wait for first question (using native DOM)
  const questionVisible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
    timeout: 15000,
  });
  console.log('[test] Question visible:', questionVisible);
  expect(questionVisible).toBe(true);

  // 3. Answer first question
  await forceClick(mainWindow, '[data-testid="clarification-option"]:has-text("A")');

  // 4. Wait for second question
  const secondQuestionVisible = await waitForText(
    mainWindow,
    '[data-testid="prompt-question"]',
    '再补充',
    10000,
  );
  expect(secondQuestionVisible).toBe(true);

  // 5. Answer second question
  await forceClick(mainWindow, '[data-testid="clarification-option"]:has-text("B")');

  // 6. Click generate button
  await clickGenerateButton(mainWindow, 15000);

  // 7. Verify OKR generated
  const okrText = await waitForText(mainWindow, '[data-testid="okr-summary"]', '提高效率', 15000);
  expect(okrText).toBe(true);
});
