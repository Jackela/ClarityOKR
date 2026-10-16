import type NodeModule from 'node:module';
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
    await both(sticky, 'S2-04-banner-closed-focus-picker');

    // N53(2): Q dismissed → Q+1's ending banner still appears normally
    await fakeNow(electronApp, Q4_ENDING);
    await expect(banner(sticky)).toHaveAttribute('data-kind', 'ending');
    await both(sticky, 'S2-05-ending-after-q-dismissed');

    // N51(2): at Q+2 (2027-Q1) Q = 2026-Q3 no longer shows (2026-Q4 is now the one before)
    await fakeNow(electronApp, Q1_2027);
    await expect(
      sticky.locator('[data-testid="review-reminder"][data-period="2026-Q3"]'),
    ).toHaveCount(0);

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
    await fakeNow(electronApp, AFTER_STALE);
    await expect(banner(sticky)).toHaveAttribute('data-kind', 'ended');

    // 去复盘: the quarter switches to Q (its OKR opens), then the review tab, title focused
    await sticky.getByTestId('review-reminder-go').click();
    await expect(sticky.getByTestId('tab-review')).toHaveAttribute('aria-selected', 'true');
    await expect(sticky.getByTestId('review-objective')).toHaveText('上季度 OKR');
    await expect(sticky.getByTestId('review-objective')).toBeFocused();
    await expect(sticky.getByTestId('review-period')).toHaveText('2026-Q3');
    await both(sticky, 'S2-06-goreview-review-title');

    // the Q view also shows Q's ended banner (N52)
    await sticky.getByTestId('tab-note').click();
    await expect(sticky.getByTestId('period-picker')).toContainText('2026-Q3');
    await expect(banner(sticky)).toHaveAttribute('data-kind', 'ended');
    await both(sticky, 'S2-07-banner-ended-q-view');

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
    // end the first run outright (no quit dialogs), then start again on the same files
    const first = electronApp.process();
    const exited = new Promise((resolve) => first.once('exit', resolve));
    first.kill('SIGKILL');
    await exited;
    const ci = getElectronLaunchOptions();
    const again = await electron.launch({
      args: [MAIN_DIST, ...extraElectronArgs(), ...ci.args],
      cwd: ROOT,
      env: {
        ...getElectronEnv(mockServer.url),
        E2E_DB_PATH: dbPath,
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
      await again.close();
    }
  });
});
