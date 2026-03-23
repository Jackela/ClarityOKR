import type { Page } from '@playwright/test';

/**
 * 等待元素出现（检查DOM存在性）
 * 注意：此函数不检查元素是否可见，只检查是否存在于DOM中
 */
export async function waitForElement(
  page: Page,
  selector: string,
  options: { timeout?: number } = {},
): Promise<boolean> {
  const { timeout = 30000 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const found = await page.evaluate((sel: string) => {
      return document.querySelector(sel) !== null;
    }, selector);

    if (found) return true;
    await page.waitForTimeout(100);
  }
  return false;
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
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const found = await page.evaluate(
      ({ sel, txt }: { sel: string; txt: string }) => {
        const el = document.querySelector(sel);
        return el?.textContent?.includes(txt) ?? false;
      },
      { sel: selector, txt: text },
    );

    if (found) return true;
    await page.waitForTimeout(100);
  }
  return false;
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
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const enabled = await page.evaluate(
      ({ sel }: { sel: string }) => {
        const btn = document.querySelector(sel) as HTMLButtonElement | null;
        return btn !== null && !btn.disabled;
      },
      { sel: selector },
    );

    if (enabled) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

/**
 * 强制点击按钮（即使disabled）
 */
export async function forceClick(page: Page, selector: string): Promise<void> {
  // 先尝试正常点击
  try {
    await page.click(selector, { timeout: 5000 });
    return;
  } catch {
    // 如果失败，使用JavaScript强制触发点击
    await page.evaluate(
      ({ sel }: { sel: string }) => {
        const btn = document.querySelector(sel) as HTMLButtonElement | null;
        if (btn) {
          btn.disabled = false;
          btn.click();
        }
      },
      { sel: selector },
    );
  }
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

  // Small delay to ensure Angular has processed the click handler
  await page.waitForTimeout(100);

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
  const selector = '[data-testid="okr-summary"]';
  const startTime = Date.now();
  let lastActualText: string | null = null;

  while (Date.now() - startTime < timeout) {
    const result = await page.evaluate(
      ({ sel, expected }: { sel: string; expected: string }) => {
        const el = document.querySelector(sel);
        if (!el) return { found: false, actualText: null };
        const text = el.textContent ?? '';
        return { found: text.includes(expected), actualText: text };
      },
      { sel: selector, expected: expectedText },
    );

    if (result.found) {
      return { found: true, actualText: result.actualText };
    }

    lastActualText = result.actualText;

    // Log progress every 5 seconds
    const elapsed = Date.now() - startTime;
    if (elapsed % 5000 < 100) {
      console.log(
        `[waitForOkrSummary] Waiting... ${elapsed}ms elapsed, last text: "${lastActualText}"`,
      );
    }

    await page.waitForTimeout(200);
  }

  return { found: false, actualText: lastActualText };
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
  const { timeout = 30000, exact = false } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const found = await page.evaluate(
      ({ sel, txt, isExact }: { sel: string; txt: string; isExact: boolean }) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const textContent = el.textContent ?? '';
        return isExact ? textContent === txt : textContent.includes(txt);
      },
      { sel: selector, txt: text, isExact: exact },
    );

    if (found) return true;
    await page.waitForTimeout(100);
  }
  return false;
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
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const exists = await page.evaluate(
      ({ sel }: { sel: string }) => {
        return document.querySelector(sel) !== null;
      },
      { sel: selector },
    );

    if (!exists) return true;
    await page.waitForTimeout(100);
  }
  return false;
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
  const { to, from, timeout = 30000, checkVisibility = false, stabilizationDelay = 0 } = options;

  const startTime = Date.now();

  // Step 1: Wait for 'from' state to disappear (if specified)
  if (from) {
    while (Date.now() - startTime < timeout) {
      const fromExists = await page.evaluate(
        ({ sel }: { sel: string }) => document.querySelector(sel) !== null,
        { sel: from },
      );
      if (!fromExists) break;
      await page.waitForTimeout(100);
    }
  }

  // Step 2: Wait for 'to' state to appear
  const remainingTimeout = timeout - (Date.now() - startTime);
  while (Date.now() - startTime < timeout) {
    const toExists = await page.evaluate(
      ({ sel, checkVis }: { sel: string; checkVis: boolean }) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        if (checkVis) {
          return (el as HTMLElement).offsetParent !== null;
        }
        return true;
      },
      { sel: to, checkVis: checkVisibility },
    );

    if (toExists) {
      // Optional stabilization delay
      if (stabilizationDelay > 0) {
        await page.waitForTimeout(stabilizationDelay);
      }
      return;
    }

    await page.waitForTimeout(100);
  }

  throw new Error(`State change timeout: expected "${to}" to appear within ${timeout}ms`);
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
  const {
    loadingSelector = '[data-testid="clarification-loading"]',
    maxWaitTime = 30000,
    minLoadingTime = 200,
  } = options;

  const startTime = Date.now();

  // Wait for loading to appear (with shorter timeout - it may already be there)
  try {
    await page.waitForSelector(loadingSelector, {
      state: 'visible',
      timeout: 5000,
    });
  } catch {
    // Loading may have already finished
  }

  // Ensure minimum loading time for visibility
  const elapsed = Date.now() - startTime;
  if (elapsed < minLoadingTime) {
    await page.waitForTimeout(minLoadingTime - elapsed);
  }

  // Wait for loading to disappear
  const remainingTimeout = maxWaitTime - (Date.now() - startTime);
  await page.waitForSelector(loadingSelector, {
    state: 'hidden',
    timeout: remainingTimeout,
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
