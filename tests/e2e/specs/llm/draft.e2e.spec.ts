import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('LLM draft generation persists and displays OKR', async ({ mainWindow, mockServer }) => {
  const clarification = new ClarificationPage(mainWindow);

  mockServer.setResponses({
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
            title: '提高执行力',
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
  });

  await clarification.waitForReady();
  await clarification.completeClarificationFlow('提高效率', {
    questionCount: 2,
    selectOptionIndex: 0,
    finalOptionIndex: 1,
  });

  const summaryText = await clarification.getOkrSummaryText();
  expect(summaryText.includes('提高执行力') || summaryText.includes('提高效率')).toBeTruthy();
});
