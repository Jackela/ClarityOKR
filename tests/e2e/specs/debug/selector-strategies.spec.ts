import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

/**
 * Helper function to start clarification and wait for error state
 */
async function startAndWaitForError(mainWindow: any, mockServer: any): Promise<void> {
  const clarification = new ClarificationPage(mainWindow);

  mockServer.setResponses({
    nextQuestion: () => null, // null triggers 503 error
  });

  await clarification.waitForReady();
  await clarification.startClarification('测试');

  // Wait for error state with retry
  await clarification.error.waitForVisible(10000);
}

test.describe('Selector Strategy Tests', () => {
  // 策略1: 标准data-testid
  test('strategy 1: standard data-testid', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    const button = mainWindow.locator('[data-testid="retry-button"]');
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  // 策略2: 使用getByRole
  test('strategy 2: getByRole', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    const button = mainWindow.getByRole('button', { name: '重试' });
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  // 策略3: 使用getByTestId
  test('strategy 3: getByTestId', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    const button = mainWindow.getByTestId('retry-button');
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  // 策略4: 使用page.evaluate直接访问DOM
  test('strategy 4: evaluate DOM', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    const exists = await mainWindow.evaluate(() => {
      const btn = document.querySelector('[data-testid="retry-button"]');
      return btn !== null;
    });
    expect(exists).toBe(true);
  });

  // 策略5: 使用waitForFunction
  test('strategy 5: waitForFunction', async ({ mainWindow, mockServer }) => {
    const clarification = new ClarificationPage(mainWindow);

    mockServer.setResponses({
      nextQuestion: () => null, // null triggers 503 error
    });

    await clarification.waitForReady();
    await clarification.startClarification('测试');

    await mainWindow.waitForFunction(
      () => {
        const btn = document.querySelector('[data-testid="retry-button"]');
        return btn !== null && (btn as HTMLElement).offsetParent !== null;
      },
      { timeout: 10000 },
    );
  });

  // 策略6: 使用frameLocator（检查是否在iframe中）
  test('strategy 6: check iframe', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    // 检查frames
    const frames = mainWindow.frames();
    console.log('Number of frames:', frames.length);

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const hasButton = (await frame.locator('[data-testid="retry-button"]').count()) > 0;
      console.log(`Frame ${i} has button:`, hasButton);
    }

    // Main window should still have the button
    const button = mainWindow.locator('[data-testid="retry-button"]');
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  // 策略7: 使用locator.filter()组合选择器
  test('strategy 7: combined selector with filter', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    const button = mainWindow.locator('button').filter({ hasText: '重试' });
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  // 策略8: 使用locator.first()确保获取第一个匹配元素
  test('strategy 8: first() locator method', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    const button = mainWindow.locator('[data-testid="retry-button"]').first();
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  // 策略9: 使用count()检查元素存在后再验证可见性
  test('strategy 9: count then verify', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    const locator = mainWindow.locator('[data-testid="retry-button"]');
    const count = await locator.count();
    expect(count).toBeGreaterThan(0);

    const isVisible = await locator.isVisible();
    expect(isVisible).toBe(true);
  });

  // 策略10: 使用locator.locator()嵌套选择器
  test('strategy 10: nested locator', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    const errorContainer = mainWindow.locator('[data-testid="error-message"]');
    const retryButton = errorContainer.locator('[data-testid="retry-button"]');
    await expect(retryButton).toBeVisible({ timeout: 10000 });
  });

  // 策略11: 使用CSS选择器链
  test('strategy 11: CSS selector chain', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    const button = mainWindow.locator('[data-testid="error-message"] [data-testid="retry-button"]');
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  // 策略12: 使用nth(0)获取第一个匹配
  test('strategy 12: nth(0) locator method', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    const button = mainWindow.locator('[data-testid="retry-button"]').nth(0);
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  // 策略13: 使用locator.all()获取所有匹配元素
  test('strategy 13: all() locator method', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    const buttons = await mainWindow.locator('[data-testid="retry-button"]').all();
    expect(buttons.length).toBeGreaterThan(0);

    for (const button of buttons) {
      await expect(button).toBeVisible({ timeout: 10000 });
    }
  });
});
