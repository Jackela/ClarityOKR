import { errors, type Page } from '@playwright/test';

/**
 * 等待元素出现（检查DOM存在性）
 * 注意：此函数不检查元素是否可见，只检查是否存在于DOM中
 */
export async function waitForElement(
  page: Page,
  selector: string,
  options: { timeout?: number } = {},
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { state: 'attached', timeout: options.timeout ?? 30000 });
    return true;
  } catch (error) {
    if (error instanceof errors.TimeoutError) return false;
    throw error;
  }
}

/**
 * 等待元素包含特定文本
 */
export async function waitForText(
  page: Page,
  selector: string,
  text: string,
  timeout = 30000,
): Promise<boolean> {
  return waitForElementText(page, selector, text, { timeout });
}

/**
 * 检查按钮是否可用
 */
export async function isButtonEnabled(page: Page, selector: string): Promise<boolean> {
  return await page.evaluate(
    ({ sel }: { sel: string }) => {
      const btn = document.querySelector(sel) as HTMLButtonElement | null;
      return btn !== null && !btn.disabled;
    },
    { sel: selector },
  );
}

/**
 * 等待按钮变为可用状态
 */
export async function waitForButtonEnabled(
  page: Page,
  selector: string,
  timeout = 10000,
): Promise<boolean> {
  try {
    await page.waitForFunction(
      (sel) => {
        const button = document.querySelector<HTMLButtonElement>(sel);
        return button !== null && !button.disabled;
      },
      selector,
      { timeout },
    );
    return true;
  } catch (error) {
    if (error instanceof errors.TimeoutError) return false;
    throw error;
  }
}

/** Click through Playwright's normal actionability checks; never enable disabled controls. */
export async function forceClick(page: Page, selector: string): Promise<void> {
  await page.locator(selector).click();
}

/**
 * 等待并点击生成按钮
 */
export async function clickGenerateButton(page: Page, timeout = 30000): Promise<void> {
  const selector = '[data-testid="clarification-generate"]';

  // Wait for button to exist
  const exists = await waitForElement(page, selector, { timeout });
  if (!exists) {
    throw new Error(`Generate button not found after ${timeout}ms`);
  }

  // Wait for button to be enabled (data-ready="true")
  await page.waitForFunction(
    (sel) => {
      const btn = document.querySelector(sel) as HTMLButtonElement | null;
      return btn && !btn.disabled;
    },
    selector,
    { timeout },
  );

  await page.click(selector);
}

/**
 * Wait for OKR summary to appear with multiple polling strategies
 * More reliable than simple text matching in CI environments
 */
export async function waitForOkrSummary(
  page: Page,
  expectedText: string,
  timeout = 30000,
): Promise<{ found: boolean; actualText: string | null }> {
  const found = await waitForText(page, '[data-testid="okr-summary"]', expectedText, timeout);
  const actualText = await page
    .locator('[data-testid="okr-summary"]')
    .textContent({ timeout: 1000 })
    .catch((error: unknown) => {
      if (error instanceof errors.TimeoutError) return null;
      throw error;
    });
  return { found, actualText };
}

/**
 * 等待错误消息出现
 */
export async function waitForErrorMessage(page: Page, timeout = 30000): Promise<void> {
  const found = await waitForElement(page, '[data-testid="error-message"]', {
    timeout,
  });

  if (!found) {
    throw new Error(`Error message not found after ${timeout}ms`);
  }
}

/**
 * 等待元素包含特定文本内容
 */
export async function waitForElementText(
  page: Page,
  selector: string,
  text: string,
  options: { timeout?: number; exact?: boolean } = {},
): Promise<boolean> {
  try {
    await page.waitForFunction(
      ({ selector, text, exact }) => {
        const actual = document.querySelector(selector)?.textContent;
        return actual != null && (exact ? actual === text : actual.includes(text));
      },
      { selector, text, exact: options.exact ?? false },
      { timeout: options.timeout ?? 30000 },
    );
    return true;
  } catch (error) {
    if (error instanceof errors.TimeoutError) return false;
    throw error;
  }
}

/**
 * 获取元素数量
 */
export async function getElementCount(page: Page, selector: string): Promise<number> {
  return await page.evaluate(
    ({ sel }: { sel: string }) => {
      return document.querySelectorAll(sel).length;
    },
    { sel: selector },
  );
}

/**
 * 等待元素消失
 */
export async function waitForElementGone(
  page: Page,
  selector: string,
  timeout = 30000,
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { state: 'detached', timeout });
    return true;
  } catch (error) {
    if (error instanceof errors.TimeoutError) return false;
    throw error;
  }
}

/**
 * State transition options for waitForStateChange
 */
export interface WaitForStateChangeOptions {
  /** The state selector to wait for (e.g., '[data-testid="error-message"]') */
  to: string;
  /** The state selector to wait to disappear before checking 'to' (optional) */
  from?: string;
  /** Maximum wait time in milliseconds */
  timeout?: number;
  /** Whether to check visibility (offsetParent !== null) or just DOM existence */
  checkVisibility?: boolean;
  /** Additional delay after state change is detected (ms) */
  stabilizationDelay?: number;
}

/**
 * Wait for a state change in the UI.
 * This is more reliable than fixed delays because it waits for actual DOM changes.
 *
 * @example
 * // Wait for loading to disappear then error to appear
 * await waitForStateChange(page, {
 *   from: '[data-testid="clarification-loading"]',
 *   to: '[data-testid="error-message"]',
 *   timeout: 15000
 * });
 *
 * @example
 * // Simple wait for error to appear
 * await waitForStateChange(page, {
 *   to: '[data-testid="error-message"]',
 *   timeout: 15000
 * });
 */
export async function waitForStateChange(
  page: Page,
  options: WaitForStateChangeOptions,
): Promise<void> {
  const { to, from, timeout = 30000, checkVisibility = false } = options;
  if (from) await page.waitForSelector(from, { state: 'detached', timeout });
  await page.waitForSelector(to, { state: checkVisibility ? 'visible' : 'attached', timeout });
}

/**
 * Wait for loading state to complete (appear then disappear).
 * This ensures that any async operation has finished.
 *
 * @example
 * await waitForLoadingComplete(page, { maxWaitTime: 20000 });
 */
export async function waitForLoadingComplete(
  page: Page,
  options: { loadingSelector?: string; maxWaitTime?: number; minLoadingTime?: number } = {},
): Promise<void> {
  await page.waitForSelector(options.loadingSelector ?? '[data-testid="clarification-loading"]', {
    state: 'hidden',
    timeout: options.maxWaitTime ?? 30000,
  });
}

/**
 * Enhanced wait for error state that properly handles the transition.
 * This waits for loading to disappear before checking for error.
 */
export async function waitForErrorState(
  page: Page,
  options: { timeout?: number; waitForRetryButton?: boolean } = {},
): Promise<{ hasError: boolean; hasRetryButton: boolean }> {
  const { timeout = 15000, waitForRetryButton = true } = options;

  // Wait for loading to disappear first
  await waitForLoadingComplete(page, { maxWaitTime: timeout });

  // Now wait for error message
  await page.waitForSelector('[data-testid="error-message"]', {
    state: 'visible',
    timeout: timeout / 2,
  });

  let hasRetry = false;
  if (waitForRetryButton) {
    try {
      await page.waitForSelector('[data-testid="retry-button"]', {
        state: 'visible',
        timeout: 5000,
      });
      hasRetry = true;
    } catch {
      hasRetry = false;
    }
  }

  return { hasError: true, hasRetryButton: hasRetry };
}
