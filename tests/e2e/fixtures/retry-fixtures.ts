import { test as base } from '@playwright/test';

// Enhanced fixtures with retry support
export const retryTest = base.extend<{
  testInfo: any;
}>({
  // Automatically inject testInfo
  testInfo: [async ({}, use, testInfo) => {
    await use(testInfo);
  }, { scope: 'test' }],
  
  // Enhanced page fixture with retry cleanup
  page: [async ({ page }, use, testInfo) => {
    // Extra cleanup on retry
    if (testInfo.retry > 0) {
      console.log(`[retry ${testInfo.retry}] Performing extra cleanup before test`);
      
      // Clear localStorage
      await page.evaluate(() => localStorage.clear()).catch(() => {});
      
      // Clear sessionStorage
      await page.evaluate(() => sessionStorage.clear()).catch(() => {});
      
      // Clear cookies
      await page.context().clearCookies().catch(() => {});
      
      // Wait for state to reset
      await page.waitForTimeout(500);
    }
    
    await use(page);
  }, { scope: 'test' }],
});

/**
 * Mark a test as flaky with additional retries
 * @param test - The test function from fixtures
 * @param title - Test title
 * @param testFn - Test function
 * @param options - Additional test options
 */
export function flakyTest(
  test: typeof base,
  title: string,
  testFn: Parameters<typeof base>[1],
  options: { retry?: number; timeout?: number } = {}
): void {
  test(title, testFn, {
    ...options,
    retry: options.retry ?? 3, // Default 3 retries for flaky tests
  });
}

/**
 * Mark a test as slow with extended timeout
 * @param test - The test function from fixtures
 * @param title - Test title
 * @param testFn - Test function
 * @param options - Additional test options
 */
export function slowTest(
  test: typeof base,
  title: string,
  testFn: Parameters<typeof base>[1],
  options: { timeout?: number } = {}
): void {
  test(title, testFn, {
    ...options,
    timeout: options.timeout ?? 120000, // Default 2 minutes for slow tests
  });
}

// Re-export expect
export { expect } from '@playwright/test';
