import type { Locator, Page, ElectronApplication } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object for the OKR Sticky window.
 * Encapsulates all interactions with the sticky window display.
 */
export class OkrStickyPage extends BasePage {
  readonly reopenButton: Locator;
  readonly objective: Locator;
  readonly keyResults: Locator;

  /**
   * Creates a new OkrStickyPage instance.
   * @param page - The Playwright page instance for the sticky window
   */
  constructor(page: Page) {
    super(page);
    this.reopenButton = page.locator('[data-testid="sticky-reopen"]');
    this.objective = page.locator('[data-testid="sticky-objective"]');
    this.keyResults = page.locator('[data-testid="sticky-key-result"]');
  }

  /**
   * Navigate to the sticky window (no-op, sticky is opened by clicking reopen).
   */
  async navigate(): Promise<void> {
    // Sticky window is opened by clicking reopen button on main page
  }

  /**
   * Wait for the sticky window to be ready.
   * Waits for the objective to be visible.
   */
  async waitForReady(): Promise<void> {
    await this.objective.waitFor({ state: 'visible', timeout: this.timeouts.default });
  }

  /**
   * Reopen the sticky window from the main page.
   * Must be called with the main window page, not the sticky window page.
   * @param mainPage - The main window page instance
   */
  async reopenFromMain(mainPage: Page): Promise<void> {
    const reopenBtn = mainPage.locator('[data-testid="sticky-reopen"]');
    await reopenBtn.waitFor({ state: 'visible', timeout: this.timeouts.default });
    await reopenBtn.click();
  }

  /**
   * Get the objective text from the sticky window.
   * @returns The objective text
   */
  async getObjective(): Promise<string> {
    await this.waitForReady();
    return this.objective.innerText();
  }

  /**
   * Get all key results from the sticky window.
   * @returns Array of key result texts
   */
  async getKeyResults(): Promise<string[]> {
    await this.objective.waitFor({ state: 'visible', timeout: this.timeouts.default });
    return this.keyResults.allInnerTexts();
  }

  /**
   * Get the count of key results.
   * @returns The number of key results
   */
  async getKeyResultCount(): Promise<number> {
    return this.keyResults.count();
  }

  /**
   * Verify that the OKR matches expected values.
   * @param expectedObjective - The expected objective text (or substring)
   * @param expectedKRCount - The expected number of key results
   */
  async verifyOKR(expectedObjective: string, expectedKRCount: number): Promise<void> {
    const objective = await this.getObjective();
    if (!objective.includes(expectedObjective)) {
      throw new Error(
        `Objective mismatch. Expected to contain "${expectedObjective}", got "${objective}"`,
      );
    }

    const krCount = await this.getKeyResultCount();
    if (krCount !== expectedKRCount) {
      throw new Error(`Key result count mismatch. Expected ${expectedKRCount}, got ${krCount}`);
    }
  }

  /**
   * Check if the sticky window is visible.
   * @returns True if the objective element is visible
   */
  async isVisible(): Promise<boolean> {
    try {
      await this.objective.waitFor({ state: 'visible', timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the sticky window is always on top.
   * Requires the ElectronApplication instance.
   * @param electronApp - The Electron application instance
   * @returns True if the window is always on top
   */
  async isAlwaysOnTop(electronApp: ElectronApplication): Promise<boolean> {
    return electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((bw) => bw.isAlwaysOnTop() && bw.isVisible());
      return !!win;
    });
  }

  /**
   * Get sticky window information including objective and key results.
   * @returns Object containing window information
   */
  async getStickyInfo(): Promise<{
    objective: string;
    keyResults: string[];
    keyResultCount: number;
  }> {
    const [objective, keyResults] = await Promise.all([this.getObjective(), this.getKeyResults()]);

    return {
      objective,
      keyResults,
      keyResultCount: keyResults.length,
    };
  }

  /**
   * Close the sticky window.
   */
  async close(): Promise<void> {
    await this.page.close();
  }
}

/**
 * Find the sticky window from the Electron application.
 * Returns null if no sticky window is found.
 * @param electronApp - The Electron application instance
 * @param options - Optional configuration
 * @param options.timeout - Maximum time to wait for sticky window (ms)
 * @returns The sticky window page or null
 */
export async function findStickyWindow(
  electronApp: ElectronApplication,
  options?: { timeout?: number },
): Promise<Page | null> {
  const timeout = options?.timeout ?? 30000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    // Use Electron API to find always-on-top windows
    const stickyWindowId = await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      const sticky = windows.find((w) => w.isAlwaysOnTop() && w.isVisible());
      return sticky ? sticky.id : null;
    });

    if (stickyWindowId) {
      // Find corresponding Playwright page by checking all pages
      const pages = electronApp.context().pages();

      for (const page of pages) {
        const isSticky = await page
          .evaluate(() => {
            const body = document.body;
            return (
              body.hasAttribute('data-sticky-window') ||
              document.title.includes('Sticky') ||
              window.location.href.includes('sticky')
            );
          })
          .catch(() => false);

        if (isSticky) {
          return page;
        }
      }

      // Fallback: return the last page (usually the newest window)
      if (pages.length > 1) {
        return pages[pages.length - 1];
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return null;
}

/**
 * Wait for the sticky window to appear.
 * Throws an error if the window doesn't appear within the timeout.
 * @param electronApp - The Electron application instance
 * @param options - Optional configuration
 * @param options.timeout - Maximum time to wait for sticky window (ms)
 * @returns The sticky window page
 * @throws Error if sticky window is not found within timeout
 */
export async function waitForStickyWindow(
  electronApp: ElectronApplication,
  options?: { timeout?: number },
): Promise<Page> {
  const sticky = await findStickyWindow(electronApp, options);

  if (!sticky) {
    const timeout = options?.timeout ?? 30000;
    throw new Error(`Timed out waiting for sticky window after ${timeout}ms`);
  }

  return sticky;
}

/**
 * Debug helper to get information about all windows.
 * @param electronApp - The Electron application instance
 * @returns Array of window information objects
 */
export async function debugWindows(electronApp: ElectronApplication): Promise<
  Array<{
    id: number;
    url: string;
    isTop: boolean;
  }>
> {
  return electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({
      id: w.id,
      url: w.webContents.getURL(),
      isTop: w.isAlwaysOnTop(),
    })),
  );
}
