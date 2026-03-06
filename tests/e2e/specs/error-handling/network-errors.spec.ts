import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

// E2E测试2: 错误恢复测试 - 网络错误→重试→成功
test('E2E-02: error recovery - network error → retry → success', async ({
  mainWindow,
  mockServer,
}) => {
  const clarification = new ClarificationPage(mainWindow);

  let failCount = 0;
  const mockConfig: MockResponseConfig = {
    nextQuestion: () => {
      failCount += 1;
      if (failCount <= 1) {
        // Return null to trigger 503 error from mock server
        return null;
      }
      return {
        question: {
          id: 'q1',
          text: '恢复后的问题',
          options: [
            { id: 'a', label: '选项A', value: 'a' },
            { id: 'b', label: '选项B', value: 'b' },
          ],
        },
      };
    },
  };
  mockServer.setResponses(mockConfig);

  await clarification.waitForReady();

  // 截图：开始前
  await mainWindow.screenshot({
    path: 'test-results/network-error-01-before-start.png',
    fullPage: true,
  });

  await clarification.startClarification('测试重试恢复');

  // 截图：启动后
  await mainWindow.screenshot({
    path: 'test-results/network-error-02-after-start.png',
    fullPage: true,
  });

  // 等待错误状态出现（给UI足够时间渲染）
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 截图：等待后
  await mainWindow.screenshot({
    path: 'test-results/network-error-03-after-wait.png',
    fullPage: true,
  });

  // 验证错误状态
  const hasRetry = await clarification.error.hasRetryButton();

  // 截图：检查retry button后
  await mainWindow.screenshot({
    path: `test-results/network-error-04-retry-check-${hasRetry}.png`,
    fullPage: true,
  });

  await expect(hasRetry).toBe(true);

  // 重试
  await clarification.retry();

  // 截图：点击重试后
  await mainWindow.screenshot({
    path: 'test-results/network-error-05-after-retry.png',
    fullPage: true,
  });

  // 验证恢复成功
  await clarification.waitForOptions();
  const questionText = await clarification.getCurrentQuestion();
  expect(questionText).toContain('恢复后的问题');
});
