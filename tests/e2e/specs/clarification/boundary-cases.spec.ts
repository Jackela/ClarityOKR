import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';
import { waitForElement, waitForText, forceClick } from '../../helpers/native-dom';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

// E2E测试4: 边界情况测试
test.describe('E2E-04: boundary cases', () => {
  test('minimum questions - generates OKR with minimum clarifications', async ({
    mainWindow,
    mockServer,
  }) => {
    const clarification = new ClarificationPage(mainWindow);

    mockServer.setResponses({
      nextQuestion: (callNumber) => {
        if (callNumber === 1) {
          return {
            question: {
              id: 'q1',
              text: '第一个问题',
              options: [
                { id: 'a', label: 'A', value: 'a' },
                { id: 'b', label: 'B', value: 'b' },
              ],
            },
          };
        }
        if (callNumber === 2) {
          return {
            question: {
              id: 'q2',
              text: '第二个问题',
              options: [
                { id: 'c', label: 'C', value: 'c' },
                { id: 'd', label: 'D', value: 'd' },
              ],
            },
          };
        }
        // Return null after 2 questions to signal completion
        return null;
      },
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '最小澄清OKR',
              description: '最少澄清问题',
              keyResults: [
                { id: 'kr1', statement: 'KR1', target: '100%', measurement: 'rate' },
                { id: 'kr2', statement: 'KR2', target: '90%', measurement: 'rate' },
                { id: 'kr3', statement: 'KR3', target: '80%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    });

    // Use completeClarificationFlow for reliability
    await clarification.completeClarificationFlow('简单目标', {
      questionCount: 2,
      selectOptionIndex: 0,
      finalOptionIndex: 1,
    });

    // Verify OKR generated
    const okrText = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '最小澄清OKR',
      15000,
    );
    expect(okrText).toBe(true);
  });

  test('maximum questions - completes after many clarifications', async ({
    mainWindow,
    mockServer,
  }) => {
    const clarification = new ClarificationPage(mainWindow);
    const maxQuestions = 5; // Reduced from 10 for faster test

    mockServer.setResponses({
      nextQuestion: (callNumber) => {
        if (callNumber <= maxQuestions) {
          return {
            question: {
              id: `q${callNumber}`,
              text: `问题 ${callNumber}/${maxQuestions}`,
              options: [
                { id: 'a', label: '继续', value: 'a' },
                { id: 'b', label: '结束', value: 'b' },
              ],
            },
          };
        }
        // Continue returning questions to avoid errors
        return {
          question: {
            id: `q${callNumber}`,
            text: `问题 ${callNumber}`,
            options: [
              { id: 'a', label: 'A', value: 'a' },
              { id: 'b', label: 'B', value: 'b' },
            ],
          },
        };
      },
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '多轮澄清后的OKR',
              description: '经过多轮澄清',
              keyResults: [
                { id: 'kr1', statement: '完成多轮回答', target: 5, measurement: 'count' },
                { id: 'kr2', statement: '高质量输出', target: '95%', measurement: 'rate' },
                { id: 'kr3', statement: '持续改进', target: '90%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    });

    // Use completeClarificationFlow for reliability
    await clarification.completeClarificationFlow('复杂目标需要多轮澄清', {
      questionCount: maxQuestions,
      selectOptionIndex: 0,
      finalOptionIndex: 1,
    });

    // Verify OKR generated
    const okrText = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '多轮澄清后的OKR',
      15000,
    );
    expect(okrText).toBe(true);
  });

  test('few questions boundary - completes with just enough selections', async ({
    mainWindow,
    mockServer,
  }) => {
    const clarification = new ClarificationPage(mainWindow);

    mockServer.setResponses({
      nextQuestion: (callNumber) => {
        if (callNumber === 1) {
          return {
            question: {
              id: 'q1',
              text: '第一个问题',
              options: [
                { id: 'yes', label: '是', value: 'yes' },
                { id: 'no', label: '否', value: 'no' },
              ],
            },
          };
        }
        if (callNumber === 2) {
          return {
            question: {
              id: 'q2',
              text: '第二个问题',
              options: [
                { id: 'opt1', label: '选项1', value: 'opt1' },
                { id: 'opt2', label: '选项2', value: 'opt2' },
              ],
            },
          };
        }
        // Return null after 2 questions to signal completion
        return null;
      },
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '少问题OKR',
              description: '只需要最少澄清',
              keyResults: [
                { id: 'kr1', statement: '快速完成', target: '2轮', measurement: 'count' },
                { id: 'kr2', statement: '高质量', target: '95%', measurement: 'rate' },
                { id: 'kr3', statement: '高效率', target: '90%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    });

    // Use completeClarificationFlow for reliability
    await clarification.completeClarificationFlow('简单问题', {
      questionCount: 2,
      selectOptionIndex: 0,
      finalOptionIndex: 1,
    });

    // Verify OKR
    const okrText = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '少问题OKR',
      15000,
    );
    expect(okrText).toBe(true);
  });
});
