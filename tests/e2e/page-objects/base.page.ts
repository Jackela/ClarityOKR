import type { Locator, Page } from '@playwright/test';

/**
 * Timeout configuration for POM operations
 */
export interface TimeoutConfig {
  /** Default timeout for element visibility (ms) */
  default: number;
  /** Short timeout for quick operations (ms) */
  short: number;
  /** Medium timeout for standard operations (ms) */
  medium: number;
  /** Long timeout for slow operations like loading (ms) */
  long: number;
}

/**
 * Default timeout values
 */
export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  default: 15000,
  short: 5000,
  medium: 10000,
  long: 30000,
};

/**
 * Abstract base class for all page objects.
 * Provides common functionality for safe interactions with page elements.
 */
export abstract class BasePage {
  /**
   * Creates a new BasePage instance.
   * @param page - The Playwright page instance
   */
  protected constructor(
    protected readonly page: Page,
    protected readonly timeouts: TimeoutConfig = DEFAULT_TIMEOUTS,
  ) {}

  /**
   * Navigate to this page.
   * Must be implemented by concrete page classes.
   */
  abstract navigate(): Promise<void>;

  /**
   * Wait for the page to be fully loaded and ready.
   * Must be implemented by concrete page classes.
   */
  abstract waitForReady(): Promise<void>;

  /**
   * Safely click an element with automatic wait for enabled state.
   * @param locator - The locator for the element to click
   * @param options - Optional configuration
   * @param options.timeout - Custom timeout in milliseconds
   */
  protected async safeClick(locator: Locator, options?: { timeout?: number }): Promise<void> {
    const timeout = options?.timeout ?? this.timeouts.default;
    await locator.waitFor({ state: 'visible', timeout });
    await locator.click({ timeout });
  }

  /**
   * Safely fill an input field with automatic clear and type.
   * @param locator - The locator for the input element
   * @param value - The value to fill
   * @param options - Optional configuration
   * @param options.timeout - Custom timeout in milliseconds
   */
  protected async safeFill(
    locator: Locator,
    value: string,
    options?: { timeout?: number },
  ): Promise<void> {
    const timeout = options?.timeout ?? this.timeouts.default;
    await locator.waitFor({ state: 'visible', timeout });
    await locator.fill(value, { timeout });
  }

  /**
   * Wait for a loading indicator to appear and then disappear.
   * Useful for async operations that show loading state.
   * @param loadingLocator - The locator for the loading element
   * @param options - Optional configuration
   * @param options.appearTimeout - Timeout for loading to appear (ms)
   * @param options.disappearTimeout - Timeout for loading to disappear (ms)
   */
  protected async waitForLoading(
    loadingLocator: Locator,
    options?: { appearTimeout?: number; disappearTimeout?: number },
  ): Promise<void> {
    const appearTimeout = options?.appearTimeout ?? this.timeouts.short;
    const disappearTimeout = options?.disappearTimeout ?? this.timeouts.long;

    await loadingLocator.waitFor({ state: 'visible', timeout: appearTimeout });
    await loadingLocator.waitFor({ state: 'hidden', timeout: disappearTimeout });
  }

  /**
   * Wait for an element to be visible.
   * @param locator - The locator to wait for
   * @param timeout - Optional custom timeout in milliseconds
   */
  protected async waitForVisible(locator: Locator, timeout?: number): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout: timeout ?? this.timeouts.default });
  }

  /**
   * Wait for an element to be hidden.
   * @param locator - The locator to wait for
   * @param timeout - Optional custom timeout in milliseconds
   */
  protected async waitForHidden(locator: Locator, timeout?: number): Promise<void> {
    await locator.waitFor({ state: 'hidden', timeout: timeout ?? this.timeouts.default });
  }

  /**
   * Check if an element is visible.
   * @param locator - The locator to check
   * @returns True if the element is visible
   */
  protected async isVisible(locator: Locator): Promise<boolean> {
    try {
      await locator.waitFor({ state: 'visible', timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get text content from an element.
   * @param locator - The locator for the element
   * @returns The text content
   */
  protected async getText(locator: Locator): Promise<string> {
    await this.waitForVisible(locator);
    return locator.innerText();
  }

  /**
   * Get all text contents from multiple elements.
   * @param locator - The locator for the elements
   * @returns Array of text contents
   */
  protected async getAllTexts(locator: Locator): Promise<string[]> {
    return locator.allInnerTexts();
  }

  /**
   * Check if an element is enabled.
   * @param locator - The locator for the element
   * @returns True if the element is enabled
   */
  protected async isEnabled(locator: Locator): Promise<boolean> {
    return locator.isEnabled();
  }

  /**
   * Wait for an element to be enabled.
   * @param locator - The locator for the element
   * @param timeout - Optional custom timeout in milliseconds
   */
  protected async waitForEnabled(locator: Locator, timeout?: number): Promise<void> {
    await locator.waitFor({
      state: 'visible',
      timeout: timeout ?? this.timeouts.default,
    });
  }
}
