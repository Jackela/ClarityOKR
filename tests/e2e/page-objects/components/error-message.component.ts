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
   * Check if an error message is currently visible.
   * @returns True if error is visible
   */
  async isVisible(): Promise<boolean> {
    await this.page.screenshot({ path: 'test-results/isVisible-before.png' });
    try {
      await this.messageLocator.waitFor({ state: 'visible', timeout: 1000 });
      await this.page.screenshot({ path: 'test-results/isVisible-success.png' });
      return true;
    } catch {
      await this.page.screenshot({ path: 'test-results/isVisible-failed.png' });
      return false;
    }
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
   * Check if the retry button is visible.
   * @returns True if retry button is visible
   */
  async hasRetryButton(): Promise<boolean> {
    await this.page.screenshot({ path: 'test-results/hasRetryButton-before.png' });
    try {
      // First wait for error message to be visible
      await this.messageLocator.waitFor({ state: 'visible', timeout: 5000 });
      // Then check retry button
      await this.retryButtonLocator.waitFor({ state: 'visible', timeout: 5000 });
      await this.page.screenshot({ path: 'test-results/hasRetryButton-success.png' });
      return true;
    } catch (e) {
      await this.page.screenshot({ path: 'test-results/hasRetryButton-failed.png' });
      // Failure diagnostics: capture DOM and locators state
      const html = await this.page.content();
      console.log('[hasRetryButton] Failed - HTML snippet:', html.substring(0, 2000));
      const messageCount = await this.messageLocator.count();
      const retryCount = await this.retryButtonLocator.count();
      console.log(
        `[hasRetryButton] Locator counts - message: ${messageCount}, retry: ${retryCount}`,
      );
      return false;
    }
  }
}
