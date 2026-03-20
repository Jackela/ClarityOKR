import type { Page } from '@playwright/test';
import { workerTest as test, expect } from '../../fixtures/worker-fixtures';
import { cleanupPersistenceFiles } from '../../fixtures';
import { waitForElement, waitForOkrSummary, forceClick } from '../../helpers/native-dom';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

async function waitForLoadingFinished(page: Page, timeout = 10000): Promise<void> {
  try {
    await page.waitForSelector('[data-testid="clarification-loading"]', {
      state: 'hidden',
      timeout,
    });
  } catch {
    // Loading might not appear if operation is fast
  }
}

async function answerQuestion(page: Page, expectedText?: string): Promise<void> {
  await waitForElement(page, '[data-testid="prompt-question"]', { timeout: 15000 });

  if (expectedText) {
    await page.waitForFunction(
      ({ expected }: { expected: string }) => {
        const el = document.querySelector('[data-testid="prompt-question"]');
        return el?.textContent?.includes(expected);
      },
      { expected: expectedText },
      { timeout: 15000 },
    );
  }

  // Use forceClick for CI reliability - bypasses Playwright stability checks
  await forceClick(page, '[data-testid="clarification-option"]:first-child');

  // Wait for UI to settle
  await waitForLoadingFinished(page);
}

// E2E测试4: 边界情况测试
test.describe('E2E-04: boundary cases', () => {
  test('minimum questions - generates OKR with minimum clarifications', async ({
    mainWindow,
    mockServer,
  }) => {
    mockServer.setResponses({
      nextQuestion: () => ({
        question: {
          id: 'q1',
          text: '第一个问题',
          options: [
            { id: 'a', label: 'A', value: 'a' },
            { id: 'b', label: 'B', value: 'b' },
          ],
        },
      }),
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

    // Start clarification
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '简单目标');
    await mainWindow.click('[data-testid="start-clarification"]');

    // Answer first question
    await answerQuestion(mainWindow);

    // Answer second question
    await answerQuestion(mainWindow);

    // Wait for generate button and click using forceClick for CI reliability
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 20000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    // Verify OKR generated
    const result = await waitForOkrSummary(mainWindow, '最小澄清OKR', 30000);
    expect(result.found, `OKR text not found. Actual text: "${result.actualText}"`).toBe(true);
  });

  test('maximum questions - completes after many clarifications', async ({
    mainWindow,
    mockServer,
  }) => {
    let questionCount = 0;
    const maxQuestions = 5;

    mockServer.setResponses({
      nextQuestion: () => {
        questionCount++;
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

    // Start clarification
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '复杂目标需要多轮澄清');
    await mainWindow.click('[data-testid="start-clarification"]');

    // Answer all questions
    for (let i = 0; i < maxQuestions; i++) {
      await answerQuestion(mainWindow, `问题 ${i + 1}/${maxQuestions}`);
    }

    // Wait for generate button and click using forceClick for CI reliability
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 20000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    // Verify OKR generated
    const result = await waitForOkrSummary(mainWindow, '多轮澄清后的OKR', 30000);
    expect(result.found, `OKR text not found. Actual text: "${result.actualText}"`).toBe(true);
  });

  test('few questions boundary - completes with just enough selections', async ({
    mainWindow,
    mockServer,
  }) => {
    mockServer.setResponses({
      nextQuestion: () => ({
        question: {
          id: 'q1',
          text: '第一个问题',
          options: [
            { id: 'yes', label: '是', value: 'yes' },
            { id: 'no', label: '否', value: 'no' },
          ],
        },
      }),
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

    // Start clarification
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '简单问题');
    await mainWindow.click('[data-testid="start-clarification"]');

    // Answer first question
    await answerQuestion(mainWindow);

    // Answer second question
    await answerQuestion(mainWindow);

    // Wait for generate button and click using forceClick for CI reliability
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 20000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    // Verify OKR
    const result = await waitForOkrSummary(mainWindow, '少问题OKR', 30000);
    expect(result.found, `OKR text not found. Actual text: "${result.actualText}"`).toBe(true);
  });
});
