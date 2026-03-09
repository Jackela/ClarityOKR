import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';
import { waitForElement, waitForText, isButtonEnabled, forceClick } from '../../helpers/native-dom';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

// E2E测试4: 边界情况测试
// Note: App requires at least 2 selections to enable generate button
test.describe('E2E-04: boundary cases', () => {
  test('minimum questions - generates OKR with minimum clarifications', async ({
    mainWindow,
    mockServer,
  }) => {
    const clarification = new ClarificationPage(mainWindow);
    let callCount = 0;

    // App requires at least 2 selections to enable generate button
    // So we need at least 2 questions before returning null
    mockServer.setResponses({
      nextQuestion: () => {
        callCount++;
        if (callCount === 1) {
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
        if (callCount === 2) {
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
        return null; // No more questions after 2
      },
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '最小澄清OKR',
              description: '最少澄清问题',
              keyResults: [{ id: 'kr1', statement: 'KR1', target: '100%', measurement: 'rate' }],
            },
          ],
        },
      },
    });

    await clarification.waitForReady();
    await clarification.startClarification('简单目标');

    // Answer first question
    const question1Visible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
      timeout: 10000,
    });
    expect(question1Visible).toBe(true);
    await forceClick(mainWindow, '[data-testid="clarification-option"]:first-child');
    await mainWindow.waitForTimeout(500);

    // Answer second question
    const question2Visible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
      timeout: 10000,
    });
    expect(question2Visible).toBe(true);
    await forceClick(mainWindow, '[data-testid="clarification-option"]:first-child');
    await mainWindow.waitForTimeout(500);

    // 等待生成按钮存在
    const buttonExists = await waitForElement(
      mainWindow,
      '[data-testid="clarification-generate"]',
      {
        timeout: 15000,
      },
    );
    expect(buttonExists).toBe(true);

    // 等待按钮可用
    const isEnabled = await isButtonEnabled(mainWindow, '[data-testid="clarification-generate"]');
    expect(isEnabled).toBe(true);

    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    // 验证OKR摘要
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
    let questionCount = 0;
    const maxQuestions = 10;

    mockServer.setResponses({
      nextQuestion: () => {
        questionCount++;
        if (questionCount <= maxQuestions) {
          return {
            question: {
              id: `q${questionCount}`,
              text: `问题 ${questionCount}/${maxQuestions}`,
              options: [
                { id: 'a', label: '继续', value: 'a' },
                { id: 'b', label: '结束', value: 'b' },
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
              title: '多轮澄清后的OKR',
              description: '经过10轮澄清',
              keyResults: [
                { id: 'kr1', statement: '完成10轮回答', target: 10, measurement: 'count' },
                { id: 'kr2', statement: '高质量输出', target: '95%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    });

    await clarification.waitForReady();
    await clarification.startClarification('复杂目标需要多轮澄清');

    // 回答所有问题
    for (let i = 0; i < maxQuestions; i++) {
      // 等待问题出现
      const questionVisible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
        timeout: 10000,
      });
      expect(questionVisible).toBe(true);

      // 使用forceClick选择选项
      const optionSelector = '[data-testid="clarification-option"]:first-child';
      await forceClick(mainWindow, optionSelector);

      // 等待一下状态变化
      await mainWindow.waitForTimeout(500);
    }

    // 等待生成按钮存在并可用，然后点击
    const buttonExists = await waitForElement(
      mainWindow,
      '[data-testid="clarification-generate"]',
      {
        timeout: 15000,
      },
    );
    expect(buttonExists).toBe(true);

    const isEnabled = await isButtonEnabled(mainWindow, '[data-testid="clarification-generate"]');
    expect(isEnabled).toBe(true);

    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    // 验证OKR
    const okrText = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '多轮澄清后的OKR',
      15000,
    );
    expect(okrText).toBe(true);
  });

  test('few questions boundary - completes with just enough selections', async ({ mainWindow, mockServer }) => {
    const clarification = new ClarificationPage(mainWindow);

    // App requires at least 2 selections to enable generate button
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
              ],
            },
          ],
        },
      },
    });

    await clarification.waitForReady();
    await clarification.startClarification('简单问题');

    // 回答第一个问题
    const question1Visible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
      timeout: 10000,
    });
    expect(question1Visible).toBe(true);
    await forceClick(mainWindow, '[data-testid="clarification-option"]:first-child');
    await mainWindow.waitForTimeout(500);

    // 回答第二个问题
    const question2Visible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
      timeout: 10000,
    });
    expect(question2Visible).toBe(true);
    await forceClick(mainWindow, '[data-testid="clarification-option"]:first-child');
    await mainWindow.waitForTimeout(500);

    // 等待生成按钮存在并可用
    const buttonExists = await waitForElement(
      mainWindow,
      '[data-testid="clarification-generate"]',
      {
        timeout: 15000,
      },
    );
    expect(buttonExists).toBe(true);

    const isEnabled = await isButtonEnabled(mainWindow, '[data-testid="clarification-generate"]');
    expect(isEnabled).toBe(true);

    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    // 验证OKR
    const okrText = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '少问题OKR',
      15000,
    );
    expect(okrText).toBe(true);
  });
});
