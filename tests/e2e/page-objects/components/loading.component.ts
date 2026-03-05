import type { Locator, Page } from '@playwright/test';

/**
 * Component for handling loading indicators.
 * Wraps common loading state operations.
 */
export class LoadingComponent {
  readonly locator: Locator;

  /**
   * Creates a new LoadingComponent.
   * @param page - The Playwright page instance
   * @param testId - The data-testid attribute for the loading element (default: 'clarification-loading')
   */
  constructor(
    private readonly page: Page,
    private readonly testId: string = 'clarification-loading',
  ) {
    this.locator = page.locator(`[data-testid="${testId}"]`);
  }

  /**
   * Wait for the loading indicator to appear.
   * @param timeout - Optional timeout in milliseconds
   */
  async waitForVisible(timeout = 5000): Promise<void> {
    await this.locator.waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for the loading indicator to disappear.
   * @param timeout - Optional timeout in milliseconds
   */
  async waitForHidden(timeout = 30000): Promise<void> {
    await this.locator.waitFor({ state: 'hidden', timeout });
  }

  /**
   * Wait for loading to appear and then disappear.
   * @param appearTimeout - Timeout for loading to appear (ms)
   * @param disappearTimeout - Timeout for loading to disappear (ms)
   */
  async waitForComplete(appearTimeout = 5000, disappearTimeout = 30000): Promise<void> {
    await this.waitForVisible(appearTimeout);
    await this.waitForHidden(disappearTimeout);
  }

  /**
   * Check if the loading indicator is currently visible.
   * @returns True if loading is visible
   */
  async isVisible(): Promise<boolean> {
    try {
      await this.locator.waitFor({ state: 'visible', timeout: 500 });
      return true;
    } catch {
      return false;
    }
  }
}
