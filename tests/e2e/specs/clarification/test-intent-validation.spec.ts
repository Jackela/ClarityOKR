import { test, expect } from '../../fixtures';

test.describe('意图输入验证', () => {
  test('空输入时提交按钮应被禁用', async ({ mainWindow }) => {
    const submitButton = mainWindow.locator('[data-testid="start-clarification"]');
    await expect(submitButton).toBeDisabled();

    await mainWindow.screenshot({ path: 'test-results/intent-empty-input.png' });
  });

  test('输入1个字符时提交按钮仍应被禁用', async ({ mainWindow }) => {
    const input = mainWindow.locator('[data-testid="intent-input"]');
    await input.fill('a');

    const submitButton = mainWindow.locator('[data-testid="start-clarification"]');
    await expect(submitButton).toBeDisabled();

    await mainWindow.screenshot({ path: 'test-results/intent-single-char.png' });
  });

  test('输入2个字符时提交按钮应被启用', async ({ mainWindow }) => {
    const input = mainWindow.locator('[data-testid="intent-input"]');
    await input.fill('ab');

    const submitButton = mainWindow.locator('[data-testid="start-clarification"]');
    await expect(submitButton).toBeEnabled();

    await mainWindow.screenshot({ path: 'test-results/intent-valid-input.png' });
  });

  test('输入500个字符应正常处理', async ({ mainWindow }) => {
    const longIntent = 'a'.repeat(500);
    const input = mainWindow.locator('[data-testid="intent-input"]');
    await input.fill(longIntent);

    const submitButton = mainWindow.locator('[data-testid="start-clarification"]');
    await expect(submitButton).toBeEnabled();
    await expect(input).toHaveValue(longIntent);

    await mainWindow.screenshot({ path: 'test-results/intent-500-chars.png' });
  });

  test('输入特殊字符应正常处理', async ({ mainWindow }) => {
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const input = mainWindow.locator('[data-testid="intent-input"]');
    await input.fill(specialChars);

    const submitButton = mainWindow.locator('[data-testid="start-clarification"]');
    await expect(submitButton).toBeEnabled();

    await mainWindow.screenshot({ path: 'test-results/intent-special-chars.png' });
  });

  test('清除输入后提交按钮应被禁用', async ({ mainWindow }) => {
    const input = mainWindow.locator('[data-testid="intent-input"]');
    await input.fill('测试');

    const submitButton = mainWindow.locator('[data-testid="start-clarification"]');
    await expect(submitButton).toBeEnabled();

    await input.clear();
    await expect(submitButton).toBeDisabled();

    await mainWindow.screenshot({ path: 'test-results/intent-cleared.png' });
  });
});
