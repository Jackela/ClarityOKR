import { test } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';

test('timing: when is button really available', async ({ mainWindow, mockServer }) => {
  mockServer.setResponses({ nextQuestion: () => null });

  const clarification = new ClarificationPage(mainWindow);
  await clarification.waitForReady();

  const startTime = Date.now();
  await clarification.startClarification('测试目标');

  // 每100ms检查一次
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const elapsed = Date.now() - startTime;

    const hasButton = await mainWindow.evaluate(() => {
      return document.querySelector('[data-testid="retry-button"]') !== null;
    });

    const isVisible = await mainWindow.evaluate(() => {
      const btn = document.querySelector('[data-testid="retry-button"]');
      return btn && (btn as HTMLElement).offsetParent !== null;
    });

    console.log(`[TEST-TIMING] ${elapsed}ms: button exists=${hasButton}, visible=${isVisible}`);

    if (hasButton && isVisible) {
      console.log(`[TEST-TIMING] Button ready at ${elapsed}ms`);
      break;
    }
  }
});
