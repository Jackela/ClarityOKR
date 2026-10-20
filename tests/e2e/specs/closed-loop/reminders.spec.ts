import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import type NodeModule from 'node:module';
import { dirname, join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { IPC_CHANNELS, quarterBanner } from '@clarityokr/contracts';

import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { MAIN_DIST, ROOT, extraElectronArgs, getElectronEnv } from '../../helpers/build-check';
import { getElectronLaunchOptions } from '../../helpers/electron-ci';
import { axe, invoke, openSticky, setTheme, shot } from '../../helpers/closed-loop';

/**
 * #54 in-app reminders (S1§11) against the real main process, with the reminder clock faked
 * (e2e only): the 7-day badge crossing its threshold, the quarter banners (N51, N52, N53),
 * 「去复盘」 switching quarter, ✕ focus, and a saved review / dismissal surviving a restart.
 * Times are mid-day UTC, far from any local day or quarter boundary in CI (UTC) and on the box.
 */

const KR_CREATED = '2026-10-16T02:00:00.000Z';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const BEFORE_STALE = new Date(Date.parse(KR_CREATED) + SEVEN_DAYS - 60_000).toISOString();
const AFTER_STALE = new Date(Date.parse(KR_CREATED) + SEVEN_DAYS + 60_000).toISOString();
const Q4_ENDING = '2026-12-22T04:00:00.000Z'; // C = 2026-Q4 in its last 14 days
const Q1_2027 = '2027-01-12T04:00:00.000Z'; // C = 2027-Q1: 2026-Q3 is two quarters back

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

/** Runs SQL on the app's own E2E database from the main process. */
async function sql(app: ElectronApplication, statements: string[]): Promise<void> {
  await app.evaluate((_electron, list) => {
    const { createRequire } = process.getBuiltinModule('node:module') as typeof NodeModule;
    const require = createRequire(`${process.cwd()}/app/main/package.json`);
    const Database = require('better-sqlite3') as new (p: string) => {
      exec: (s: string) => void;
      close: () => void;
    };
    const db = new Database(process.env.E2E_DB_PATH as string);
    for (const s of list) db.exec(s);
    db.close();
  }, statements);
}

/** Moves the reminder clock and asks every window to re-evaluate (like focus / the timer). */
async function fakeNow(app: ElectronApplication, iso: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, value) => {
    (globalThis as { __CLARITYOKR_FAKE_NOW__?: string }).__CLARITYOKR_FAKE_NOW__ = value;
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('clarityokr:reminders:tick');
    }
  }, iso);
}

/** Width of the sticky window (the one that is not the main window). */
async function stickySize(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => {
    const all = BrowserWindow.getAllWindows();
    const sticky = all.find((w) => w.isAlwaysOnTop()) ?? all[all.length - 1];
    return sticky.getSize()[0];
  });
}

async function setStickyWidth(app: ElectronApplication, width: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, w) => {
    const all = BrowserWindow.getAllWindows();
    const sticky = all.find((win) => win.isAlwaysOnTop()) ?? all[all.length - 1];
    const [, h] = sticky.getSize();
    sticky.setMinimumSize(Math.min(w, 320), 200);
    sticky.setSize(w, h);
  }, width);
}

async function both(page: Page, name: string): Promise<void> {
  await shot(page, `${name}-light`);
  await setTheme(page, 'dark');
  await shot(page, `${name}-dark`);
  await setTheme(page, 'light');
}

/** The open (pinned) OKR in Q+1 = 2026-Q4, an unreviewed one in Q = 2026-Q3, fixed KR dates. */
async function seed(app: ElectronApplication, sticky: Page): Promise<string> {
  const list = await invoke(sticky, IPC_CHANNELS.OKR_LIST);
  const current = list.data.items[0].id as string;
  await sql(app, [
    `UPDATE objectives SET period = '2026-Q4' WHERE id = '${current}'`,
    `UPDATE key_results SET created_at = '${KR_CREATED}'`,
    `INSERT INTO objectives (id, title, period, pinned, source_session_id, created_at, updated_at)
       VALUES ('okr-prev', '上季度 OKR', '2026-Q3', 0, NULL, '2026-07-02T02:00:00.000Z', '2026-07-02T02:00:00.000Z')`,
    `INSERT INTO key_results (id, objective_id, position, statement, success_metric, progress, status, removed_at, created_at, updated_at)
       VALUES ('kr-prev-1', 'okr-prev', 0, '上季度关键结果一', NULL, 40, 'in_progress', NULL, '2026-07-02T02:00:00.000Z', '2026-07-02T02:00:00.000Z'),
              ('kr-prev-2', 'okr-prev', 1, '上季度关键结果二', NULL, NULL, 'not_started', NULL, '2026-07-02T02:00:00.000Z', '2026-07-02T02:00:00.000Z')`,
  ]);
  await sticky.reload();
  await sticky.getByTestId('kr-list').waitFor({ state: 'visible' });
  return current;
}

/** Main-window entry point: Q = 2026-Q3 unreviewed, the open OKR set to Q+1 = 2026-Q4. */
async function mainWindowSetup(
  electronApp: ElectronApplication,
  mainWindow: Page,
  mockServer: Parameters<typeof openSticky>[2],
): Promise<{ sticky: Page; panel: ReturnType<Page['getByTestId']>; threshold: number }> {
  const sticky = await openSticky(electronApp, mainWindow, mockServer);
  const panel = mainWindow.getByTestId('okr-summary');
  await expect(panel.getByTestId('kr-list')).toBeVisible();

  // Q = 2026-Q3 (an unreviewed OKR), the open one in Q+1 = 2026-Q4 set through the picker
  await sql(electronApp, [
    `INSERT INTO objectives (id, title, period, pinned, source_session_id, created_at, updated_at)
       VALUES ('okr-prev', '上季度 OKR', '2026-Q3', 0, NULL, '2026-07-02T02:00:00.000Z', '2026-07-02T02:00:00.000Z')`,
    `INSERT INTO key_results (id, objective_id, position, statement, success_metric, progress, status, removed_at, created_at, updated_at)
       VALUES ('kr-prev-1', 'okr-prev', 0, '上季度关键结果一', NULL, 40, 'in_progress', NULL, '2026-07-02T02:00:00.000Z', '2026-07-02T02:00:00.000Z')`,
  ]);
  await panel.getByTestId('period-picker').click();
  await mainWindow.getByRole('option', { name: '2026-Q4' }).click();
  await expect(panel.getByTestId('period-picker')).toContainText('2026-Q4');
  const created = await electronApp.evaluate(() => {
    const { createRequire } = process.getBuiltinModule('node:module') as typeof NodeModule;
    const require = createRequire(`${process.cwd()}/app/main/package.json`);
    const Database = require('better-sqlite3') as new (p: string) => {
      prepare: (s: string) => { get: () => { at: string } };
      close: () => void;
    };
    const db = new Database(process.env.E2E_DB_PATH as string);
    const row = db
      .prepare(
        `SELECT MAX(created_at) AS at FROM key_results WHERE objective_id <> 'okr-prev' AND removed_at IS NULL`,
      )
      .get();
    db.close();
    return row.at;
  });
  const threshold = Date.parse(created) + SEVEN_DAYS;
  return { sticky, panel, threshold };
}

/** N56: focused AND showing its ring. */
const focusVisible = (locator: ReturnType<Page['getByTestId']>) =>
  locator.evaluate((el) => el === document.activeElement && el.matches(':focus-visible'));

/** A ring is really drawn: a non-zero outline (or box-shadow) in the computed style. */
const ringDrawn = (locator: ReturnType<Page['getByTestId']>) =>
  locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    return outline || (cs.boxShadow !== 'none' && cs.boxShadow !== '');
  });

const banner = (sticky: Page) => sticky.getByTestId('review-reminder');

test.describe('#54 in-app reminders (fake time)', () => {
  test('badge threshold, N51(1)(2), N53 precedence and per-quarter dismissal, focus, no Notification', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await seed(electronApp, sticky);
    // no system notification is ever shown
    await electronApp.evaluate(({ Notification }) => {
      const g = globalThis as { __notified?: number };
      g.__notified = 0;
      Notification.prototype.show = function () {
        g.__notified = (g.__notified ?? 0) + 1;
      };
    });

    // N51(1): at Q+1 with Q unreviewed → Q's ended banner, in the Q+1 view; 1 min before 7×24h
    await fakeNow(electronApp, BEFORE_STALE);
    await expect(banner(sticky)).toHaveAttribute('data-kind', 'ended');
    await expect(banner(sticky)).toHaveAttribute('data-period', '2026-Q3');
    await expect(banner(sticky)).toHaveAttribute('role', 'status');
    await expect
      .poll(async () => (await banner(sticky).textContent())?.replace(/\s/g, ''))
      .toContain('本季度已经结束，还没复盘，去复盘');
    await expect(sticky.getByTestId('kr-stale-badge')).toHaveCount(0);
    await both(sticky, 'S2-02-banner-ended-q1-view');

    // the clock crosses 7×24h → every KR without an update shows the badge
    await fakeNow(electronApp, AFTER_STALE);
    await expect(sticky.getByTestId('kr-stale-badge').first()).toHaveText('7 天未更新');
    const badge = sticky.getByTestId('kr-stale-badge').first();
    expect(await badge.getAttribute('tabindex')).toBeNull();
    const box = await badge.boundingBox();
    expect(Math.round(box!.height)).toBe(18);
    await both(sticky, 'S2-01-kr-stale-badge');

    // N53(1): Q+1 in its ending window and Q unreviewed → only Q+1's ending banner
    await fakeNow(electronApp, Q4_ENDING);
    await expect(banner(sticky)).toHaveAttribute('data-kind', 'ending');
    await expect(banner(sticky)).toHaveCount(1);
    await expect
      .poll(async () => (await banner(sticky).textContent())?.replace(/\s/g, ''))
      .toContain('本季度即将结束，去复盘');
    await axe(sticky, 'reminder banner');
    await both(sticky, 'S2-03-banner-ending');

    // ✕ on Q's ended banner: gone, focus on the quarter picker; Esc never closes it
    await fakeNow(electronApp, AFTER_STALE);
    await expect(banner(sticky)).toHaveAttribute('data-kind', 'ended');
    await sticky.getByTestId('review-reminder-go').focus();
    await sticky.keyboard.press('Escape');
    await expect(banner(sticky)).toHaveCount(1);
    await sticky.getByTestId('review-reminder-close').click();
    await expect(banner(sticky)).toHaveCount(0);
    await expect(sticky.getByTestId('period-picker')).toBeFocused();
    expect(await focusVisible(sticky.getByTestId('period-picker'))).toBe(true); // N56
    await both(sticky, 'S2-04-banner-closed-focus-picker');

    // N53(2): Q dismissed → Q+1's ending banner still appears normally
    await fakeNow(electronApp, Q4_ENDING);
    await expect(banner(sticky)).toHaveAttribute('data-kind', 'ending');
    await both(sticky, 'S2-05-ending-after-q-dismissed');

    // Narrow window (< 360px): the badge wraps to its own line, the banner text wraps and
    // 去复盘 / ✕ stay real text / button (never icons only).
    const wide = await stickySize(electronApp);
    await setStickyWidth(electronApp, 320);
    await expect.poll(() => sticky.evaluate(() => window.innerWidth)).toBeLessThan(360);
    const statement = sticky.getByTestId('kr-statement').first();
    const firstBadge = statement.getByTestId('kr-stale-badge');
    await expect(firstBadge).toBeVisible();
    const statementBox = (await statement.boundingBox())!;
    const badgeBox = (await firstBadge.boundingBox())!;
    expect(badgeBox.y).toBeGreaterThan(statementBox.y + 4); // on a later line than the title
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(
      statementBox.x + statementBox.width + 1,
    );
    expect(Math.round(badgeBox.height)).toBe(18);
    await both(sticky, 'S2-09-narrow-badge-wraps');

    await setStickyWidth(electronApp, wide);

    // N51(2): at Q+2 (2027-Q1) Q = 2026-Q3 no longer shows (2026-Q4 is now the one before)
    await fakeNow(electronApp, Q1_2027);
    await expect(
      sticky.locator('[data-testid="review-reminder"][data-period="2026-Q3"]'),
    ).toHaveCount(0);

    // S2-11: viewing a quarter older than the one before (2026-Q4 at 2027-Q2) → no banner
    await fakeNow(electronApp, '2027-04-14T04:00:00.000Z');
    await expect(sticky.getByTestId('tab-note')).toHaveAttribute('aria-selected', 'true');
    await expect(sticky.getByTestId('sticky-objective')).toBeVisible();
    await expect(sticky.getByTestId('sticky-objective')).not.toHaveText('上季度 OKR');
    await expect(banner(sticky)).toHaveCount(0);
    await both(sticky, 'S2-11-older-quarter-no-banner');

    const notified = await electronApp.evaluate(
      () => (globalThis as { __notified?: number }).__notified ?? 0,
    );
    expect(notified).toBe(0);
  });

  test('去复盘 switches to Q and focuses the review title; a saved review hides it now and after a restart (N51(3))', async ({
    electronApp,
    mainWindow,
    mockServer,
  }, testInfo) => {
    test.setTimeout(150_000);
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await seed(electronApp, sticky);
    // the badge refreshes when the clock crosses 7×24h (shell entry point)
    await fakeNow(electronApp, BEFORE_STALE);
    await expect(banner(sticky)).toHaveAttribute('data-kind', 'ended');
    await expect(sticky.getByTestId('kr-stale-badge')).toHaveCount(0);
    await fakeNow(electronApp, AFTER_STALE);
    await expect(sticky.getByTestId('kr-stale-badge').first()).toHaveText('7 天未更新');
    await expect(banner(sticky)).toHaveAttribute('data-kind', 'ended');

    // 去复盘: the quarter switches to Q (its OKR opens), then the review tab, title focused
    await sticky.getByTestId('review-reminder-go').click();
    await expect(sticky.getByTestId('tab-review')).toHaveAttribute('aria-selected', 'true');
    await expect(sticky.getByTestId('review-objective')).toHaveText('上季度 OKR');
    await expect(sticky.getByTestId('review-objective')).toBeFocused();
    await expect(sticky.getByTestId('review-period')).toHaveText('2026-Q3');
    expect(await focusVisible(sticky.getByTestId('review-objective'))).toBe(true); // N56
    await both(sticky, 'S2-06-goreview-review-title');

    // the Q view also shows Q's ended banner (N52)
    await sticky.getByTestId('tab-note').click();
    await expect(sticky.getByTestId('period-picker')).toContainText('2026-Q3');
    await expect(banner(sticky)).toHaveAttribute('data-kind', 'ended');
    await both(sticky, 'S2-07-banner-ended-q-view');

    // S2-10: narrow window, the longer 已经结束 text wraps; 去复盘 / ✕ stay text / a button
    const wide = await stickySize(electronApp);
    await setStickyWidth(electronApp, 320);
    await expect.poll(() => sticky.evaluate(() => window.innerWidth)).toBeLessThan(360);
    const go = sticky.getByTestId('review-reminder-go');
    const close = sticky.getByTestId('review-reminder-close');
    await expect(go).toHaveText('去复盘');
    const bannerBox = (await banner(sticky).boundingBox())!;
    expect(bannerBox.height).toBeGreaterThan(40); // the text wrapped
    expect((await go.boundingBox())!.width).toBeGreaterThan(30);
    const closeBox = (await close.boundingBox())!;
    expect(Math.round(closeBox.width)).toBe(32);
    expect(bannerBox.x + bannerBox.width).toBeGreaterThanOrEqual(closeBox.x + closeBox.width);
    expect(
      await sticky.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await both(sticky, 'S2-10-narrow-banner-wraps');
    await setStickyWidth(electronApp, wide);

    // save Q's review → the banner goes at once
    await sticky.getByTestId('tab-review').click();
    await sticky.getByTestId('review-wentWell').fill('上季度节奏稳定');
    await sticky.getByTestId('review-save').click();
    await expect(sticky.getByTestId('review-state')).not.toHaveText('还没有复盘');
    await sticky.getByTestId('tab-note').click();
    await expect(banner(sticky)).toHaveCount(0);
    await both(sticky, 'S2-08-banner-gone-after-review');

    // restart on the same database: still reviewed → no banner for Q
    const dbPath = testInfo.outputPath('clarityokr.db');
    // A second launch on a copy of everything the first run saved (database incl. WAL, reminder
    // settings): what a restart reads. Its own folder gives it its own profile and instance lock,
    // so the first app (and the fixture's teardown / coverage) stays untouched.
    const restartDir = testInfo.outputPath('restart');
    mkdirSync(restartDir, { recursive: true });
    for (const name of readdirSync(dirname(dbPath))) {
      if (name.startsWith('clarityokr.db') || name === 'reminder-settings.json') {
        copyFileSync(join(dirname(dbPath), name), join(restartDir, name));
      }
    }
    const ci = getElectronLaunchOptions();
    const again = await electron.launch({
      args: [MAIN_DIST, ...extraElectronArgs(), ...ci.args],
      cwd: ROOT,
      env: {
        ...getElectronEnv(mockServer.url),
        E2E_DB_PATH: join(restartDir, 'clarityokr.db'),
        CLARITYOKR_FAKE_NOW: AFTER_STALE,
        ...ci.env,
      } as Record<string, string>,
    });
    try {
      const win = await again.firstWindow({ timeout: 60_000 });
      await win.waitForLoadState('domcontentloaded');
      const list = await invoke(win, IPC_CHANNELS.OKR_LIST);
      const reminders = await invoke(win, IPC_CHANNELS.REMINDERS_GET);
      const prev = list.data.items.find((i: { id: string }) => i.id === 'okr-prev');
      expect(prev.reviewed).toBe(true);
      expect(reminders.now.slice(0, 13)).toBe(AFTER_STALE.slice(0, 13));
      for (const viewPeriod of ['2026-Q4', '2026-Q3'] as const) {
        expect(
          quarterBanner({
            now: new Date(reminders.now),
            viewPeriod,
            okrs: list.data.items,
            dismissed: reminders.dismissedQuarters,
          }).banner,
        ).toBe('none');
      }
    } finally {
      // the app keeps running in the tray on close: end it outright
      again.process().kill('SIGKILL');
    }
  });

  test('#84 review: main-window results panel — banner, badge crossing 7×24h, 去复盘 opens Q review', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const { sticky, panel, threshold } = await mainWindowSetup(electronApp, mainWindow, mockServer);

    // banner at the top of the results panel, above the OKR title; no badge 1 min before
    await fakeNow(electronApp, new Date(threshold - 60_000).toISOString());
    const mainBanner = panel.getByTestId('review-reminder');
    await expect(mainBanner).toHaveAttribute('data-kind', 'ended');
    await expect(mainBanner).toHaveAttribute('data-period', '2026-Q3');
    await expect(mainBanner).toHaveAttribute('role', 'status');
    const titleBox = (await panel.getByTestId('sticky-objective').boundingBox())!;
    const bannerBox = (await mainBanner.boundingBox())!;
    expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(titleBox.y);
    await expect(panel.getByTestId('kr-stale-badge')).toHaveCount(0);

    // the clock crosses 7×24h → the badge appears without reopening anything
    await fakeNow(electronApp, new Date(threshold + 60_000).toISOString());
    await expect(panel.getByTestId('kr-stale-badge').first()).toHaveText('7 天未更新');
    await both(mainWindow, 'S2-12-main-banner-stale');

    // 去复盘: Q's OKR opens on the review page (in the sticky shell), focus on its heading
    await panel.getByTestId('review-reminder-go').click();
    await expect(sticky.getByTestId('tab-review')).toHaveAttribute('aria-selected', 'true');
    await expect(sticky.getByTestId('review-objective')).toHaveText('上季度 OKR');
    await expect(sticky.getByTestId('review-period')).toHaveText('2026-Q3');
    await expect(sticky.getByTestId('review-objective')).toBeFocused();
    expect(await focusVisible(sticky.getByTestId('review-objective'))).toBe(true); // N56 cross-window
    await both(sticky, 'S2-13-main-goreview-focus');
  });

  test('N56 main window: ✕ moves a visible focus ring to the quarter picker', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const { panel, threshold } = await mainWindowSetup(electronApp, mainWindow, mockServer);
    await fakeNow(electronApp, new Date(threshold + 60_000).toISOString());
    await expect(panel.getByTestId('review-reminder')).toBeVisible();
    await panel.getByTestId('review-reminder-close').click();
    await expect(panel.getByTestId('review-reminder')).toHaveCount(0);
    await expect(panel.getByTestId('period-picker')).toBeFocused();
    expect(await focusVisible(panel.getByTestId('period-picker'))).toBe(true);
  });

  test('N55 (1): sticky window closed → 去复盘 from the main window opens a new one on Q review', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const { sticky, panel, threshold } = await mainWindowSetup(electronApp, mainWindow, mockServer);
    await fakeNow(electronApp, new Date(threshold + 60_000).toISOString());
    // really gone (not just hidden to the tray)
    const stickyUrl = sticky.url();
    await electronApp.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) if (w.isAlwaysOnTop()) w.destroy();
    });
    await expect.poll(() => sticky.isClosed()).toBe(true);
    const next = electronApp.waitForEvent('window', { timeout: 30_000 });
    await panel.getByTestId('review-reminder-go').click();
    const fresh = await next;
    expect(fresh.url().split('#')[0]).toBe(stickyUrl.split('#')[0]);
    await expect(fresh.getByTestId('tab-review')).toHaveAttribute('aria-selected', 'true');
    await expect(fresh.getByTestId('review-objective')).toHaveText('上季度 OKR');
    await expect(fresh.getByTestId('review-period')).toHaveText('2026-Q3');
    await expect(fresh.getByTestId('review-objective')).toBeFocused();
    expect(await focusVisible(fresh.getByTestId('review-objective'))).toBe(true);
    const front = await electronApp.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.isAlwaysOnTop());
      return w ? w.isVisible() && !w.isMinimized() : false;
    });
    expect(front).toBe(true);
  });

  test('#87 shell entry: 去复盘 in the sticky shell focuses the review heading with a drawn ring', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await seed(electronApp, sticky);
    await fakeNow(electronApp, AFTER_STALE);
    await expect(banner(sticky)).toHaveAttribute('data-kind', 'ended');
    await sticky.getByTestId('review-reminder-go').click();
    const heading = sticky.getByTestId('review-objective');
    await expect(sticky.getByTestId('tab-review')).toHaveAttribute('aria-selected', 'true');
    await expect(heading).toBeFocused();
    expect(await focusVisible(heading)).toBe(true);
    expect(await ringDrawn(heading)).toBe(true);
  });

  test('N55 (3a): sticky window open on another quarter, no edits → 去复盘 from the main window raises it on Q review', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const { sticky, panel, threshold } = await mainWindowSetup(electronApp, mainWindow, mockServer);
    await fakeNow(electronApp, new Date(threshold + 60_000).toISOString());
    // the sticky note shows 2026-Q4 (not Q), nothing being edited, and is out of sight (hidden to
    // the tray; xvfb has no window manager, so minimize() does not take effect there)
    await expect(sticky.getByTestId('tab-note')).toHaveAttribute('aria-selected', 'true');
    await expect(sticky.getByTestId('sticky-objective')).toBeVisible();
    await expect(sticky.getByTestId('sticky-objective')).not.toHaveText('上季度 OKR');
    await expect(sticky.getByTestId('edit-objective')).toHaveCount(0);
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.isAlwaysOnTop())!
        .hide();
    });
    await expect
      .poll(() =>
        electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.isAlwaysOnTop())!
            .isVisible(),
        ),
      )
      .toBe(false);

    await panel.getByTestId('review-reminder-go').click();
    // brought to the front: restored and visible, no discard dialog
    await expect
      .poll(() =>
        electronApp.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows().find((x) => x.isAlwaysOnTop());
          return w ? w.isVisible() && !w.isMinimized() : false;
        }),
      )
      .toBe(true);
    await expect(sticky.getByTestId('discard-dialog')).toHaveCount(0);
    await expect(sticky.getByTestId('tab-review')).toHaveAttribute('aria-selected', 'true');
    await expect(sticky.getByTestId('review-period')).toHaveText('2026-Q3');
    await expect(sticky.getByTestId('review-objective')).toHaveText('上季度 OKR');
    await expect(sticky.getByTestId('review-objective')).toBeFocused();
    expect(await focusVisible(sticky.getByTestId('review-objective'))).toBe(true);
    expect(await ringDrawn(sticky.getByTestId('review-objective'))).toBe(true);
  });

  test('N55 (3): sticky window editing with unsaved text → the existing discard dialog asks first', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const { sticky, panel, threshold } = await mainWindowSetup(electronApp, mainWindow, mockServer);
    await fakeNow(electronApp, new Date(threshold + 60_000).toISOString());
    // the sticky note is on another quarter (2026-Q4) and in edit mode with a change
    await sticky.getByTestId('edit-button').click();
    const objective = sticky.getByTestId('edit-objective');
    await objective.fill('改了一半的目标');

    // 去复盘 from the main window → the sticky note asks, nothing is dropped yet
    await panel.getByTestId('review-reminder-go').click();
    const dialog = sticky.getByTestId('discard-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('放弃未保存的修改？');
    // #85 review: the safe answer holds the focus with a visible ring, so Enter keeps the edits
    const keep = dialog.getByRole('button', { name: '继续编辑' });
    await expect(keep).toBeFocused();
    expect(await focusVisible(keep)).toBe(true);
    await both(sticky, 'S2-14-goreview-unsaved-edit-confirm-focus');

    // 继续编辑 (Enter on the default focus): the edits stay, no quarter switch
    await sticky.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(objective).toHaveValue('改了一半的目标');
    await expect(sticky.getByTestId('tab-note')).toHaveAttribute('aria-selected', 'true');

    // again, and 放弃: Q's review opens with a visible focus ring on its heading
    await panel.getByTestId('review-reminder-go').click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '放弃' }).click();
    await expect(sticky.getByTestId('tab-review')).toHaveAttribute('aria-selected', 'true');
    await expect(sticky.getByTestId('review-objective')).toHaveText('上季度 OKR');
    await expect(sticky.getByTestId('review-objective')).toBeFocused();
    expect(await focusVisible(sticky.getByTestId('review-objective'))).toBe(true);
  });
});
