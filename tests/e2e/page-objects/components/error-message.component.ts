import type { Locator, Page } from '@playwright/test';

/**
 * Component for handling error messages and retry functionality.
 */
export class ErrorMessageComponent {
  readonly messageLocator: Locator;
  readonly retryButtonLocator: Locator;

  /**
   * Creates a new ErrorMessageComponent.
   * @param page - The Playwright page instance
   */
  constructor(private readonly page: Page) {
    this.messageLocator = page.locator('[data-testid="error-message"]');
    this.retryButtonLocator = page.locator('[data-testid="retry-button"]');
  }

  /**
   * Wait for the error message to be visible.
   * @param timeout - Optional timeout in milliseconds
   */
  async waitForVisible(timeout = 15000): Promise<void> {
    await this.messageLocator.waitFor({ state: 'visible', timeout });
  }

  /**
   * Get the error message text.
   * @returns The error message text
   */
  async getText(): Promise<string> {
    await this.waitForVisible();
    return this.messageLocator.innerText();
  }

  /**
   * Check if an error message is currently visible using super-debug pattern.
   * Uses count() + evaluate() for reliable DOM detection.
   * @returns True if error is visible
   */
  async isVisible(timeout: number = 15000): Promise<boolean> {
    await this.page.screenshot({ path: 'test-results/isVisible-before.png' });
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Method 1: Check count (DOM existence)
      const count = await this.messageLocator.count();
      if (count > 0) {
        // Method 2: Check actual visibility via evaluate
        const isVisible = await this.page.evaluate(() => {
          const el = document.querySelector('[data-testid="error-message"]') as HTMLElement | null;
          return el !== null && el.offsetParent !== null;
        });
        if (isVisible) {
          await this.page.screenshot({ path: 'test-results/isVisible-success.png' });
          return true;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    await this.page.screenshot({ path: 'test-results/isVisible-failed.png' });
    return false;
  }

  /**
   * Wait for the retry button to be visible.
   * @param timeout - Optional timeout in milliseconds
   */
  async waitForRetryButton(timeout = 15000): Promise<void> {
    await this.retryButtonLocator.waitFor({ state: 'visible', timeout });
  }

  /**
   * Click the retry button.
   */
  async clickRetry(): Promise<void> {
    await this.waitForRetryButton();
    await this.retryButtonLocator.click();
  }

  /**
   * Check if the retry button is visible using super-debug pattern.
   * Uses count() + evaluate() for reliable DOM detection.
   * @returns True if retry button is visible
   */
  async hasRetryButton(timeout: number = 15000): Promise<boolean> {
    await this.page.screenshot({ path: 'test-results/hasRetryButton-before.png' });
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Method 1: Check count (DOM existence)
      const messageCount = await this.messageLocator.count();
      const retryCount = await this.retryButtonLocator.count();

      if (messageCount > 0 && retryCount > 0) {
        // Method 2: Check actual visibility via evaluate
        const isVisible = await this.page.evaluate(() => {
          const errorEl = document.querySelector(
            '[data-testid="error-message"]',
          ) as HTMLElement | null;
          const retryEl = document.querySelector(
            '[data-testid="retry-button"]',
          ) as HTMLElement | null;
          return (
            errorEl !== null &&
            errorEl.offsetParent !== null &&
            retryEl !== null &&
            retryEl.offsetParent !== null
          );
        });
        if (isVisible) {
          await this.page.screenshot({ path: 'test-results/hasRetryButton-success.png' });
          return true;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    // Timeout reached - capture diagnostics
    await this.page.screenshot({ path: 'test-results/hasRetryButton-failed.png' });
    const html = await this.page.content();
    console.log('[hasRetryButton] Failed - HTML snippet:', html.substring(0, 2000));
    const messageCount = await this.messageLocator.count();
    const retryCount = await this.retryButtonLocator.count();
    console.log(`[hasRetryButton] Locator counts - message: ${messageCount}, retry: ${retryCount}`);
    return false;
  }
}
