import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
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
  // Configure mock
  const mockConfig: MockResponseConfig = {
    nextQuestion: (callNumber) => {
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
  mockServer.setResponses(mockConfig);

  // SIMPLIFIED TEST: Just verify the basic flow works

  // 1. Fill intent and start
  await mainWindow.fill('[data-testid="intent-input"]', '提高效率');
  await mainWindow.click('[data-testid="start-clarification"]');

  // 2. Wait for first question (using native DOM)
  const questionVisible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
    timeout: 10000,
  });
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
