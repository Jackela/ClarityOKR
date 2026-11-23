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

/** Sets the main (not always-on-top) window's client area to {@link MAIN_CONTENT_SIZE}. */
export async function fixMainContentSize(app: ElectronApplication, main: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }, size) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.isAlwaysOnTop());
    w?.setContentSize(size.width, size.height);
  }, MAIN_CONTENT_SIZE);
  await expect
    .poll(() => main.evaluate(() => [window.innerWidth, window.innerHeight]), {
      message: `main window client area is ${MAIN_CONTENT_SIZE.width}×${MAIN_CONTENT_SIZE.height}`,
    })
    .toEqual([MAIN_CONTENT_SIZE.width, MAIN_CONTENT_SIZE.height]);
}
