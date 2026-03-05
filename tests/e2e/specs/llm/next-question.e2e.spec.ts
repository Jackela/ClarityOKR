import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('LLM next-question updates prompt after selection', async ({ mainWindow, mockServer }) => {
  const clarification = new ClarificationPage(mainWindow);

  mockServer.setResponses({
    nextQuestion: () => ({
      prompt: {
        id: 'q2',
        question: '请选择下一步',
        sequence: 1,
        context: 'LLM generated',
        options: [
          { id: 'a', label: 'A', value: 'a' },
          { id: 'b', label: 'B', value: 'b' },
        ],
      },
    }),
  });

  await clarification.waitForReady();
  await clarification.startClarification('提高效率');
  await clarification.answerQuestion(0);

  const questionText = await clarification.getCurrentQuestion();
  expect(questionText.includes('请选择下一步') || questionText.includes('再补充')).toBeTruthy();
});
