import type { Page } from '@playwright/test';

/**
 * Window type with Angular and Zone.js properties
 */
interface AngularWindow extends Window {
  ng?: { getComponent?: () => unknown };
  Zone?: { current?: { _numPending?: number } };
}

/**
 * Wait for Angular application to be fully bootstrapped and stable.
 * This ensures zone.js has patched all necessary APIs before we interact with elements.
 */
export async function waitForAngularBootstrap(page: Page, timeout = 30000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const isReady = await page.evaluate(() => {
      const win = window as AngularWindow;

      // Check for Angular 2+ application
      if (win.ng && typeof win.ng.getComponent === 'function') {
        const el = document.querySelector(
          'clarityokr-root, app-root, [data-testid="intent-input"]',
        );
        return el !== null;
      }

      // Check for zone.js presence
      if (win.Zone && win.Zone.current) {
        const el = document.querySelector(
          'clarityokr-root, app-root, [data-testid="intent-input"]',
        );
        return el !== null;
      }

      // Fallback: check for the app element
      const el = document.querySelector('clarityokr-root, app-root, [data-testid="intent-input"]');
      return el !== null;
    });

    if (isReady) {
      console.log('[Angular] Bootstrap detected, waiting for stability...');
      // Give Angular extra time to stabilize
      await page.waitForTimeout(500);
      return true;
    }

    await page.waitForTimeout(100);
  }

  console.warn('[Angular] Bootstrap timeout - continuing anyway');
  return false;
}

/**
 * Check if Angular is currently processing any pending microtasks or macrotasks.
 * Zone.js tracks these, so if Zone is stable, Angular should be too.
 */
export async function isAngularStable(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const win = window as AngularWindow;

    // Method 1: Check if Angular's NgZone has pending macrotasks
    if (win.ng && win.ng.getComponent) {
      // Angular 2+ detected - assume stable if app is running
      return true;
    }

    // Method 2: Check Zone.js current task count
    if (win.Zone && win.Zone.current) {
      const zone = win.Zone.current as { _numPending?: number };
      if (zone._numPending !== undefined) {
        return zone._numPending === 0;
      }
    }

    // Method 3: Assume stable if no obvious pending tasks
    return true;
  });
}

/**
 * Wait for Angular to finish any pending change detection cycles.
 */
export async function waitForAngularStable(page: Page, timeout = 10000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const stable = await isAngularStable(page);
    if (stable) {
      return;
    }
    await page.waitForTimeout(50);
  }

  console.warn('[Angular] Stability timeout - continuing');
}

/**
 * Fill an input and trigger Angular's change detection properly.
 * Uses JavaScript to set value and dispatch events that zone.js patches.
 */
export async function angularFill(page: Page, selector: string, value: string): Promise<void> {
  // Wait for Angular to be ready
  await waitForAngularBootstrap(page, 5000).catch(() => {});

  // Wait for the input element to be ready
  await page.waitForSelector(selector, { state: 'attached' });

  // Use JavaScript to set the value directly and dispatch input event
  // This ensures zone.js patches the event properly
  await page.evaluate(
    ({ sel, val }) => {
      const input = document.querySelector(sel) as HTMLInputElement | null;
      if (input) {
        // Set value directly
        input.value = val;
        // Create and dispatch input event (zone.js patches EventTarget.prototype.addEventListener)
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        // Create and dispatch change event
        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      }
    },
    { sel: selector, val: value },
  );

  // Wait for Angular to process
  await page.waitForTimeout(200);
  await waitForAngularStable(page, 2000).catch(() => {});
}

/**
 * Click an element and ensure Angular's change detection runs.
 * Uses JavaScript's native .click() which zone.js patches properly.
 */
export async function angularClick(
  page: Page,
  selector: string,
  options: { timeout?: number; force?: boolean } = {},
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { timeout = 10000, force: _force = false } = options;

  // Wait for Angular to be ready
  await waitForAngularBootstrap(page, 5000).catch(() => {});

  // First ensure element exists and is visible
  const element = page.locator(selector);
  await element.waitFor({ state: 'visible', timeout });

  // Use JavaScript's native .click() which zone.js properly patches
  // This is different from Playwright's CDP click which bypasses zone.js
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) {
      el.click();
    }
  }, selector);

  // Wait for Angular to process the click
  await page.waitForTimeout(200);
  await waitForAngularStable(page, 5000).catch(() => {});
}

/**
 * Submit a form and ensure Angular processes the submission.
 */
export async function angularSubmit(page: Page, selector: string): Promise<void> {
  await waitForAngularBootstrap(page, 5000).catch(() => {});

  await page.evaluate((sel) => {
    const form = document.querySelector(sel) as HTMLFormElement | null;
    if (form) {
      // Create and dispatch submit event (zone.js should patch this)
      const event = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(event);
    }
  }, selector);

  // Wait for Angular to process
  await page.waitForTimeout(100);
  await waitForAngularStable(page, 5000).catch(() => {});
}

/**
 * Wait for a specific element to appear in the DOM with Angular compatibility.
 */
export async function waitForAngularElement(
  page: Page,
  selector: string,
  options: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' } = {},
): Promise<boolean> {
  const { timeout = 30000, state = 'visible' } = options;

  try {
    await page.waitForSelector(selector, { state, timeout });
    // After element appears, give Angular time to stabilize
    await page.waitForTimeout(100);
    await waitForAngularStable(page, 2000).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
