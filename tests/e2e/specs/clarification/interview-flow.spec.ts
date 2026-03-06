import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('completes interview and enables OKR generation', async ({ mainWindow, mockServer }) => {
  const clarification = new ClarificationPage(mainWindow);

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

  await clarification.waitForReady();
  await clarification.completeClarificationFlow('提高效率', {
    questionCount: 2,
    selectOptionIndex: 0,
    finalOptionIndex: 1,
  });

  await expect(mainWindow.locator('[data-testid="okr-summary"]')).toContainText('提高效率');
});
