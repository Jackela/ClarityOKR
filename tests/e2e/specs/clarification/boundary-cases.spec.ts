import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';
import { waitForElement, waitForText, isButtonEnabled, forceClick } from '../../helpers/native-dom';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

// E2E测试4: 边界情况测试
test.describe('E2E-04: boundary cases', () => {
  test('minimum questions - generates OKR with 0 clarifications', async ({
    mainWindow,
    mockServer,
  }) => {
    const clarification = new ClarificationPage(mainWindow);

    // 立即返回null（0个问题）
    mockServer.setResponses({
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '直接生成的OKR',
              description: '无需澄清',
              keyResults: [{ id: 'kr1', statement: 'KR1', target: '100%', measurement: 'rate' }],
            },
          ],
        },
      },
    });

    await clarification.waitForReady();
    await clarification.startClarification('简单目标');

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
      '直接生成的OKR',
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

  test('single question boundary', async ({ mainWindow, mockServer }) => {
    const clarification = new ClarificationPage(mainWindow);

    mockServer.setResponses({
      nextQuestion: (callNumber) => {
        if (callNumber === 1) {
          return {
            question: {
              id: 'q1',
              text: '只有一个问题',
              options: [
                { id: 'yes', label: '是', value: 'yes' },
                { id: 'no', label: '否', value: 'no' },
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
              title: '单问题OKR',
              description: '只有一个澄清问题',
              keyResults: [
                { id: 'kr1', statement: '快速完成', target: '1轮', measurement: 'count' },
              ],
            },
          ],
        },
      },
    });

    await clarification.waitForReady();
    await clarification.startClarification('简单问题');

    // 等待问题出现
    const questionVisible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
      timeout: 10000,
    });
    expect(questionVisible).toBe(true);

    // 回答唯一的问题
    await forceClick(mainWindow, '[data-testid="clarification-option"]:first-child');

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
      '单问题OKR',
      15000,
    );
    expect(okrText).toBe(true);
  });
});
