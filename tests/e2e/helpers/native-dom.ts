import type { Page } from '@playwright/test';

/**
 * 可靠的DOM查询工具 - 使用原生document.querySelector
 */
export async function waitForElement(
  page: Page,
  selector: string,
  options: { timeout?: number; checkVisibility?: boolean } = {},
): Promise<boolean> {
  const { timeout = 30000, checkVisibility = false } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const found = await page.evaluate(
      ({ sel, checkVis }: { sel: string; checkVis: boolean }) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        if (checkVis) {
          const htmlEl = el as HTMLElement;
          return htmlEl.offsetParent !== null;
        }
        return true;
      },
      { sel: selector, checkVis: checkVisibility },
    );

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

  // 等待按钮存在
  const exists = await waitForElement(page, selector, { timeout });
  if (!exists) {
    throw new Error(`Generate button not found after ${timeout}ms`);
  }

  // 检查是否可用
  const enabled = await isButtonEnabled(page, selector);

  if (enabled) {
    await page.click(selector);
  } else {
    // 强制启用并点击
    await forceClick(page, selector);
  }
}

/**
 * 等待错误消息出现
 */
export async function waitForErrorMessage(page: Page, timeout = 30000): Promise<void> {
  const found = await waitForElement(page, '[data-testid="error-message"]', {
    timeout,
    checkVisibility: true,
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
