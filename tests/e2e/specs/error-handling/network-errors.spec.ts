import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';
import { waitForElement, waitForErrorMessage, forceClick, waitForText } from '../../helpers/native-dom';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

// E2E测试2: 错误恢复测试 - 网络错误→重试→成功
// Note: Error occurs after initial prompt, when requesting next question
test('E2E-02: error recovery - network error → retry → success', async ({
  mainWindow,
  mockServer,
}) => {
  const clarification = new ClarificationPage(mainWindow);

  // Step 1: Normal response for initial load
  mockServer.setResponses({
    nextQuestion: () => ({
      question: {
        id: 'q1',
        text: '第一个问题',
        options: [
          { id: 'a', label: '选项A', value: 'a' },
          { id: 'b', label: '选项B', value: 'b' },
        ],
      },
    }),
  });

  await clarification.waitForReady();

  // 截图：开始前
  await mainWindow.screenshot({
    path: 'test-results/network-error-01-before-start.png',
    fullPage: true,
  });

  // Start clarification - this should succeed (initial prompt)
  await clarification.startClarification('测试重试恢复');

  // Wait for first question
  const question1Visible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
    timeout: 10000,
  });
  expect(question1Visible).toBe(true);

  // 截图：启动后
  await mainWindow.screenshot({
    path: 'test-results/network-error-02-after-start.png',
    fullPage: true,
  });

  // Step 2: Switch to error mode before answering
  mockServer.setResponses({
    nextQuestion: () => null, // Return null to trigger 503 error
  });

  // Answer first question - this will trigger the error
  await forceClick(mainWindow, '[data-testid="clarification-option"]:first-child');

  // 等待错误消息出现（使用原生DOM）
  await waitForErrorMessage(mainWindow, 15000);

  // 截图：等待后
  await mainWindow.screenshot({
    path: 'test-results/network-error-03-after-wait.png',
    fullPage: true,
  });

  // 验证错误状态 - 使用原生DOM检查重试按钮
  const hasRetry = await waitForElement(mainWindow, '[data-testid="retry-button"]', {
    timeout: 5000,
  });

  // 截图：检查retry button后
  await mainWindow.screenshot({
    path: `test-results/network-error-04-retry-check-${hasRetry}.png`,
    fullPage: true,
  });

  await expect(hasRetry).toBe(true);

  // Step 3: Switch back to success mode before retry
  mockServer.setResponses({
    nextQuestion: () => ({
      question: {
        id: 'q2',
        text: '恢复后的问题',
        options: [
          { id: 'c', label: '选项C', value: 'c' },
          { id: 'd', label: '选项D', value: 'd' },
        ],
      },
    }),
  });

  // 重试 - 使用forceClick
  await forceClick(mainWindow, '[data-testid="retry-button"]');

  // 截图：点击重试后
  await mainWindow.screenshot({
    path: 'test-results/network-error-05-after-retry.png',
    fullPage: true,
  });

  // 验证恢复成功 - 使用原生DOM等待问题出现
  const question2Visible = await waitForElement(mainWindow, '[data-testid="prompt-question"]', {
    timeout: 15000,
  });
  expect(question2Visible).toBe(true);

  // Verify the recovered question text
  const hasRecoveredText = await waitForText(
    mainWindow,
    '[data-testid="prompt-question"]',
    '恢复后的问题',
    5000,
  );
  expect(hasRecoveredText).toBe(true);
});
