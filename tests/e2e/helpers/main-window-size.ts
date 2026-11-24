import type { ElectronApplication, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Fixed content (client-area) size of the main window in E2E, and so of every main-window
 * design shot (#146).
 *
 * The app creates the main window as a framed 1200×800 *outer* window. On Linux the title bar
 * is drawn by Chromium with the GTK title font, so its height follows the fonts the runner
 * resolves: 29px on most CI runs, 27px on some (1200×771 vs 1200×773). The root component's
 * `min-height: 100vh` follows the client area, so bottom bars, centred dialogs and scrolled
 * pages moved 1–2px between otherwise identical builds.
 *
 * E2E now sets the client area itself (`setContentSize`) right after launch, so layout,
 * scrolling and shots all happen at this size whatever the title bar is. 771 = the design
 * baseline (800 − 29). Test-only: the app's own window size is not changed.
 */
export const MAIN_CONTENT_SIZE = { width: 1200, height: 771 } as const;

/**
 * Sets the client area of the window that hosts `main` to {@link MAIN_CONTENT_SIZE}.
 *
 * #195: the window is the one Playwright maps to the `main` page (`app.browserWindow(main)`),
 * not "the first window that is not always on top": a sticky with 窗口始终在最前 off, a second
 * window or DevTools would otherwise be resized instead. The sticky page is refused, so a
 * mix-up fails loudly instead of resizing the wrong window.
 */
export async function fixMainContentSize(app: ElectronApplication, main: Page): Promise<void> {
  expect(isStickyUrl(main.url()), `fixMainContentSize got the sticky page (${main.url()})`).toBe(
    false,
  );
  const host = await app.browserWindow(main);
  try {
    await host.evaluate((w, size) => {
      w.setContentSize(size.width, size.height);
    }, MAIN_CONTENT_SIZE);
  } finally {
    await host.dispose();
  }
  await expect
    .poll(() => main.evaluate(() => [window.innerWidth, window.innerHeight]), {
      message: `main window client area is ${MAIN_CONTENT_SIZE.width}×${MAIN_CONTENT_SIZE.height}`,
    })
    .toEqual([MAIN_CONTENT_SIZE.width, MAIN_CONTENT_SIZE.height]);
}

/** The sticky window loads the renderer with `?view=sticky` (`sticky-window-manager.ts`). */
export function isStickyUrl(url: string): boolean {
  try {
    return new URL(url).searchParams.get('view') === 'sticky';
  } catch {
    return false;
  }
}
