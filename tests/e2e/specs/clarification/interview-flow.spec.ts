import { workerTest as test, expect } from '../../fixtures/worker-fixtures';
import { cleanupPersistenceFiles } from '../../fixtures';
import { waitForText, clickGenerateButton } from '../../helpers/native-dom';
import {
  angularFill,
  angularClick,
  waitForAngularElement,
  waitForAngularBootstrap,
} from '../../helpers/angular-dom';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('completes interview and enables OKR generation', async ({ mainWindow, mockServer }) => {
  // Wait for app to fully load and Angular to bootstrap
  await mainWindow.waitForLoadState('domcontentloaded');
  await waitForAngularBootstrap(mainWindow, 30000);

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

  // 1. Fill intent using Angular-aware fill
  await angularFill(mainWindow, '[data-testid="intent-input"]', '提高效率');
  console.log('[test] Filled intent input');

  // 2. Click start button using Angular-aware click
  await angularClick(mainWindow, '[data-testid="start-clarification"]', { timeout: 15000 });
  console.log('[test] Clicked start-clarification');

  // Wait for the request to be sent
  await mainWindow.waitForTimeout(500);

  // Check what was sent to mock server
  const requestLog = mockServer.getRequestLog();
  console.log('[test] Request log after start:', JSON.stringify(requestLog, null, 2));

  // 3. Wait for first question using Angular-aware wait
  const questionVisible = await waitForAngularElement(
    mainWindow,
    '[data-testid="prompt-question"]',
    { timeout: 20000 },
  );
  console.log('[test] Question visible:', questionVisible);
  expect(questionVisible).toBe(true);

  // 4. Answer first question using Angular-aware click
  await angularClick(mainWindow, '[data-testid="clarification-option"]:has-text("A")');
  console.log('[test] Answered first question');

  // 5. Wait for second question
  const secondQuestionVisible = await waitForText(
    mainWindow,
    '[data-testid="prompt-question"]',
    '再补充',
    10000,
  );
  expect(secondQuestionVisible).toBe(true);

  // 6. Answer second question
  await angularClick(mainWindow, '[data-testid="clarification-option"]:has-text("B")');
  console.log('[test] Answered second question');

  // 7. Click generate button
  await clickGenerateButton(mainWindow, 15000);
  console.log('[test] Clicked generate button');

  // 8. Verify OKR generated
  const okrText = await waitForText(mainWindow, '[data-testid="okr-summary"]', '提高效率', 15000);
  expect(okrText).toBe(true);
});
