import { test as base } from '@playwright/test';
import type { TestInfo, Page } from '@playwright/test';

// Enhanced fixtures with retry support
export const retryTest = base.extend<{
  testInfo: TestInfo;
  page: Page;
}>({
  // Automatically inject testInfo
  testInfo: [
    async (_fixtures, use, testInfo) => {
      await use(testInfo);
    },
    { scope: 'test' },
  ],

  // Enhanced page fixture with retry cleanup
  page: [
    async ({ page }, use, testInfo) => {
      // Extra cleanup on retry
      if (testInfo.retry > 0) {
        console.log(`[retry ${testInfo.retry}] Performing extra cleanup before test`);

        // Clear localStorage
        await page.evaluate(() => localStorage.clear()).catch(() => {});

        // Clear sessionStorage
        await page.evaluate(() => sessionStorage.clear()).catch(() => {});

        // Clear cookies
        await page
          .context()
          .clearCookies()
          .catch(() => {});

        // Wait for state to reset
        await page.waitForTimeout(500);
      }
      await use(page);
    },
    { scope: 'test' },
  ],
});

export function flakyTest(
  test: typeof base,
  title: string,
  testFn: any,
  options: { retry?: number; timeout?: number } = {},
): void {
  //
  (test as any)(title, testFn);
}

export function slowTest(
  test: typeof base,
  title: string,
  testFn: any,
  options: { timeout?: number } = {},
): void {
  //
  (test as any)(title, testFn);
}

// Re-export expect
export { expect } from '@playwright/test';
