import type { ElectronApplication } from '@playwright/test';

import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { openSticky } from '../../helpers/closed-loop';
import { MAIN_CONTENT_SIZE, fixMainContentSize, isStickyUrl } from '../../helpers/main-window-size';

/**
 * #195: `fixMainContentSize` resizes the window that hosts the main page, even when more than
 * one window is not always on top (the sticky with 窗口始终在最前 off, plus an extra window).
 * Before, it took the first window with `!isAlwaysOnTop()`.
 */

const STICKY_TITLE = 'ClarityOKR Sticky';
const EXTRA_TITLE = 'e2e-195-extra';

type Sizes = Record<'main' | 'sticky' | 'extra', number[] | null>;

/** Content sizes of the main, sticky and extra windows (by title / URL, not by order). */
const contentSizes = (app: ElectronApplication): Promise<Sizes> =>
  app.evaluate(
    ({ BrowserWindow }, titles) => {
      const all = BrowserWindow.getAllWindows();
      const size = (w: Electron.BrowserWindow | undefined) => (w ? w.getContentSize() : null);
      const isSticky = (w: Electron.BrowserWindow) =>
        w.webContents.getURL().includes('view=sticky');
      return {
        main: size(
          all.find(
            (w) => !isSticky(w) && w.getTitle() !== titles.extra && w.getTitle() !== titles.sticky,
          ),
        ),
        sticky: size(all.find(isSticky)),
        extra: size(all.find((w) => w.getTitle() === titles.extra)),
      };
    },
    { extra: EXTRA_TITLE, sticky: STICKY_TITLE },
  );

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('#195: picks the main window when several windows are not always on top', async ({
  electronApp,
  mainWindow,
  mockServer,
}) => {
  // isStickyUrl: only ?view=sticky is the sticky page. Checked inside this Electron test so
  // every E2E test still yields an Electron coverage capture (remap-source-coverage.mjs).
  expect(isStickyUrl('file:///app/index.html?view=sticky')).toBe(true);
  expect(isStickyUrl('clarityokr://app/index.html?view=sticky#/x')).toBe(true);
  expect(isStickyUrl('file:///app/index.html')).toBe(false);
  expect(isStickyUrl('file:///app/index.html?view=main')).toBe(false);
  expect(isStickyUrl('about:blank')).toBe(false);
  expect(isStickyUrl('not a url')).toBe(false);

  const sticky = await openSticky(electronApp, mainWindow, mockServer);

  // Two more windows that are NOT always on top, created before the main window is resized:
  // the sticky with 窗口始终在最前 off, and an extra plain window.
  await electronApp.evaluate(
    async ({ BrowserWindow }, titles) => {
      const stickyWin = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('view=sticky'),
      );
      stickyWin?.setAlwaysOnTop(false);
      const extra = new BrowserWindow({ width: 640, height: 480, show: true, title: titles.extra });
      extra.setContentSize(640, 480);
      await extra.loadURL(`data:text/html,<title>${encodeURIComponent(titles.extra)}</title>extra`);
    },
    { extra: EXTRA_TITLE },
  );
  // Knock the main window off the fixed size so the helper has to set it again.
  await electronApp.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(
      (w) =>
        !w.webContents.getURL().includes('view=sticky') &&
        !w.webContents.getURL().startsWith('data:'),
    );
    main?.setContentSize(1000, 650);
  });
  await expect
    .poll(() => mainWindow.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual([1000, 650]);

  const before = await contentSizes(electronApp);
  const nonTop = await electronApp.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isAlwaysOnTop()).length,
  );
  expect(nonTop, 'main, sticky (on-top off) and the extra window are all not on top').toBe(3);

  await fixMainContentSize(electronApp, mainWindow);

  const after = await contentSizes(electronApp);
  expect(after.main).toEqual([MAIN_CONTENT_SIZE.width, MAIN_CONTENT_SIZE.height]);
  expect(after.sticky, 'sticky window untouched').toEqual(before.sticky);
  expect(after.extra, 'extra window untouched').toEqual([640, 480]);

  // Handing it the sticky page is refused instead of resizing the sticky window.
  await expect(fixMainContentSize(electronApp, sticky)).rejects.toThrow(/sticky page/);
  expect((await contentSizes(electronApp)).sticky).toEqual(before.sticky);

  await electronApp.evaluate(({ BrowserWindow }, title) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle() === title)
      ?.destroy();
  }, EXTRA_TITLE);
});
