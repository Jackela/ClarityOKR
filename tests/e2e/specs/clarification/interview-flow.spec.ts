import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
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
              { id: 'kr2', statement: 'KR2', target: 5, measurement: 'count' },
              { id: 'kr3', statement: 'KR3', target: '2s', measurement: 'latency' },
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

  // 2. Wait for first question
  await expect(mainWindow.locator('[data-testid="prompt-question"]')).toBeVisible({
    timeout: 10000,
  });

  // 3. Answer first question
  await mainWindow.click('[data-testid="clarification-option"]:has-text("A")');

  // 4. Wait for second question
  await expect(
    mainWindow.locator('[data-testid="prompt-question"]:has-text("再补充")'),
  ).toBeVisible({ timeout: 10000 });

  // 5. Answer second question
  await mainWindow.click('[data-testid="clarification-option"]:has-text("B")');

  // 6. Wait and click generate (may need force if button is disabled)
  await mainWindow.waitForTimeout(3000);
  await mainWindow.click('[data-testid="clarification-generate"]');

  // 7. Verify OKR generated
  await expect(mainWindow.locator('[data-testid="okr-summary"]')).toContainText('提高效率', {
    timeout: 15000,
  });
});
