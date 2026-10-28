import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import type NodeModule from 'node:module';
import { dirname, join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import type { MockResponseConfig } from '@clarityokr/contracts';

import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { MAIN_DIST, ROOT, extraElectronArgs, getElectronEnv } from '../../helpers/build-check';
import { getElectronLaunchOptions } from '../../helpers/electron-ci';
import { mockFor, setTheme, shot } from '../../helpers/closed-loop';
import { forceClick, waitForElement } from '../../helpers/native-dom';
import { ClarificationPage, waitForStickyWindow } from '../../page-objects';

/**
 * #110 (new-1, spec S3§12) against the real main process: unsaved text edit + review input is
 * written by the main process on `query-session-end` (Windows log off / shut down, simulated
 * here; real-device behaviour 未实测, #45), and a relaunch on a copy of that profile offers it
 * back in the window that owns it. Screenshots S3-01 … S3-08, light and dark (S3§12.6).
 */

// 32 characters: the bar shows the first 9 + 「…」 (S3§12.5 v3.3)
const LONG = '提升团队交付效率与质量，并把发布节奏稳定在每周两次以上的长期目标';
const SHOWN = '提升团队交付效率与…';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

async function both(page: Page, name: string): Promise<void> {
  await shot(page, `${name}-light`);
  await setTheme(page, 'dark');
  await shot(page, `${name}-dark`);
  await setTheme(page, 'light');
}

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

async function stickyWith(
  app: ElectronApplication,
  main: Page,
  mockServer: { setResponses: (c: MockResponseConfig) => Promise<void> },
): Promise<Page> {
  const clarification = new ClarificationPage(main);
  await mockServer.setResponses(mockFor(LONG));
  await clarification.waitForReady();
  await clarification.completeClarificationFlow('提高团队效率', {
    questionCount: 2,
    selectOptionIndex: 0,
    finalOptionIndex: 1,
  });
  await clarification.waitForOkrSummary(30000);
  await waitForElement(main, '[data-testid="sticky-reopen"]', { timeout: 10000 });
  await forceClick(main, '[data-testid="sticky-reopen"]');
  const sticky = await waitForStickyWindow(app);
  await sticky.getByTestId('kr-list').waitFor({ state: 'visible' });
  return sticky;
}

/** A second launch on a copy of the first one's database and `userData/drafts`. */
async function relaunch(
  first: string,
  dir: string,
  mockUrl: string,
  edit: (drafts: string) => void,
): Promise<{ app: ElectronApplication; main: Page }> {
  mkdirSync(join(dir, 'profile', 'drafts'), { recursive: true });
  for (const name of readdirSync(first)) {
    if (name.startsWith('clarityokr.db')) copyFileSync(join(first, name), join(dir, name));
  }
  const from = join(first, 'profile', 'drafts');
  for (const name of readdirSync(from)) {
    copyFileSync(join(from, name), join(dir, 'profile', 'drafts', name));
  }
  edit(join(dir, 'profile', 'drafts'));
  const ci = getElectronLaunchOptions();
  const app = await electron.launch({
    args: [MAIN_DIST, ...extraElectronArgs(), ...ci.args],
    cwd: ROOT,
    env: {
      ...getElectronEnv(mockUrl),
      E2E_DB_PATH: join(dir, 'clarityokr.db'),
      ...ci.env,
    } as Record<string, string>,
  });
  const main = await app.firstWindow({ timeout: 60_000 });
  await main.waitForLoadState('domcontentloaded');
  return { app, main };
}

/** Opens the sticky window of a relaunched app on its OKR (e2e hook in the main process). */
async function openStickyOf(app: ElectronApplication, okrId: string): Promise<Page> {
  await app.evaluate(async (_electron, id) => {
    const hook = (globalThis as { __clarityokrE2E?: { openSticky: (i: string) => Promise<void> } })
      .__clarityokrE2E;
    await hook?.openSticky(id);
  }, okrId);
  return waitForStickyWindow(app);
}

async function setStickyWidth(app: ElectronApplication, width: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, w) => {
    const sticky = BrowserWindow.getAllWindows().find((win) => win.isAlwaysOnTop());
    if (!sticky) return;
    const [, h] = sticky.getSize();
    sticky.setMinimumSize(Math.min(w, 320), 200);
    sticky.setSize(w, h);
  }, width);
}

const focusVisible = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.activeElement?.matches(':focus-visible') ?? false);

test.describe('S3§12 session-end draft restore (#110)', () => {
  test('session end saves the drafts; relaunch offers 恢复 / 放弃 in the owning window', async ({
    electronApp,
    mainWindow,
    mockServer,
  }, testInfo) => {
    test.setTimeout(240_000);
    const sticky = await stickyWith(electronApp, mainWindow, mockServer);
    const okrId = (
      (await sticky.evaluate(() =>
        (
          window as unknown as {
            clarifyOkr: { invoke: (c: string, p?: unknown) => Promise<unknown> };
          }
        ).clarifyOkr.invoke('clarityokr:okr:list'),
      )) as { data: { items: { id: string }[] } }
    ).data.items[0].id;

    // unsaved input: key result 2 in the text edit, then the review text
    await sticky.getByTestId('edit-button').click();
    await sticky.getByTestId('edit-kr-1').fill('测试覆盖率提升到 90%');
    await sticky.getByTestId('tab-review').click();
    await sticky.getByTestId('review-wentWell').fill('发布流程更稳了');
    await expect(sticky.getByTestId('review-state')).toHaveText('有未保存的修改');

    // Windows asks to end the session: the main process writes the drafts (no dialog, no wait)
    const profile = join(dirname(testInfo.outputPath('clarityokr.db')), 'profile');
    const stickyFile = join(profile, 'drafts', 'sticky.json');
    await sticky.waitForTimeout(1500); // the reports reach the main process
    // one app-wide handler: every window gets the event, the drafts are written once
    await electronApp.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.emit('query-session-end');
    });
    await expect
      .poll(async () => {
        try {
          return (JSON.parse(readFileSync(stickyFile, 'utf8')) as { rows: { kind: string }[] }).rows
            .map((r) => r.kind)
            .sort();
        } catch {
          return [];
        }
      })
      .toEqual(['review', 'textEdit']);
    const saved = JSON.parse(readFileSync(stickyFile, 'utf8'));
    expect(saved.version).toBe(1);
    expect(saved.window).toBe('sticky');

    // The main window's wizard draft (its goal at step 2); written as the app writes it.
    const wizardFile = (drafts: string): void =>
      writeFileSync(
        join(drafts, 'main.json'),
        JSON.stringify({
          version: 1,
          window: 'main',
          savedAt: new Date().toISOString(),
          rows: [{ kind: 'wizard', step: 2, intent: '提高团队效率' }],
        }),
      );
    const first = dirname(testInfo.outputPath('clarityokr.db'));
    await sql(electronApp, [`UPDATE objectives SET period = '2026-Q4' WHERE id = '${okrId}'`]);

    // ---------- launch B: text edit + review (2026-Q4), wizard in the main window ----------
    const b = await relaunch(first, testInfo.outputPath('b'), mockServer.url, wizardFile);
    try {
      const mainBar = b.main.getByTestId('draft-bar');
      await expect(mainBar).toBeVisible({ timeout: 30_000 });
      await expect(mainBar).toHaveAttribute('role', 'region');
      await expect(b.main.getByTestId('draft-line').locator('[aria-hidden="true"]')).toHaveText([
        '新建 OKR 向导里填的目标',
      ]);
      await expect(b.main.getByTestId('draft-restore')).toBeFocused();
      await both(b.main, 'S3-01-main-bar-wizard');

      // 放弃 asks first; 「先留着」 holds the focus (S3-04) and keeps everything
      await b.main.getByTestId('draft-discard').click();
      await expect(b.main.getByTestId('draft-discard-dialog')).toBeVisible();
      await expect(b.main.getByTestId('dialog-cancel')).toBeFocused();
      await expect(b.main.getByTestId('dialog-cancel')).toHaveText('先留着');
      await both(b.main, 'S3-04-discard-confirm');
      await b.main.keyboard.press('Escape');
      await expect(mainBar).toBeVisible();

      // hiding / closing (to tray) and showing the main window again is not a decision
      await b.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => !x.isAlwaysOnTop())!;
        w.hide();
        w.show();
      });
      await expect(mainBar).toBeVisible();
      expect(readdirSync(join(testInfo.outputPath('b'), 'profile', 'drafts')).sort()).toEqual([
        'main.json',
        'sticky.json',
      ]);

      let s = await openStickyOf(b.app, okrId);
      await setStickyWidth(b.app, 420);
      let bar = s.getByTestId('draft-bar');
      await expect(bar).toBeVisible({ timeout: 30_000 });
      // hiding the sticky window (clarityokr:window:hide) and opening it again: the bar is back
      await s.evaluate(() =>
        (
          window as unknown as { clarifyOkr: { invoke: (c: string) => Promise<unknown> } }
        ).clarifyOkr.invoke('clarityokr:window:hide'),
      );
      s = await openStickyOf(b.app, okrId);
      bar = s.getByTestId('draft-bar');
      await expect(bar).toBeVisible({ timeout: 30_000 });
      const lines = s.getByTestId('draft-line');
      await expect(lines).toHaveCount(2);
      await expect(lines.nth(0).locator('[aria-hidden="true"]')).toHaveText(
        `「${SHOWN}」第 2 个关键结果的文字`,
      );
      await expect(lines.nth(0)).toHaveAttribute('title', `「${LONG}」第 2 个关键结果的文字`);
      await expect(lines.nth(1).locator('[aria-hidden="true"]')).toHaveText('2026-Q4 的复盘');
      // 420 wide: the buttons sit under the text, 恢复 on the right, each line on one line
      const restoreBox = (await s.getByTestId('draft-restore').boundingBox())!;
      const discardBox = (await s.getByTestId('draft-discard').boundingBox())!;
      const textBox = (await lines.nth(0).boundingBox())!;
      expect(restoreBox.y).toBeGreaterThan(textBox.y + textBox.height);
      expect(restoreBox.x).toBeGreaterThan(discardBox.x);
      expect(Math.round(restoreBox.height)).toBe(36);
      expect(textBox.height).toBeLessThanOrEqual(22);
      await both(s, 'S3-02-sticky-bar-text-edit-review');

      // new unsaved edits on the spot → 「用上次没保存的内容替换现在的修改？」, 保留现在的 focused (S3-07)
      await s.getByTestId('tab-note').click();
      await s.getByTestId('edit-button').click();
      await s.getByTestId('edit-kr-0').fill('新的修改');
      await s.getByTestId('draft-restore').click();
      await expect(s.getByTestId('draft-replace-dialog')).toBeVisible();
      await expect(s.getByTestId('dialog-cancel')).toHaveText('保留现在的');
      await expect(s.getByTestId('dialog-cancel')).toBeFocused();
      await both(s, 'S3-07-replace-confirm');
      await s.getByTestId('dialog-confirm').click();

      // restored, still unsaved; focus order wizard → text edit → review (S3§12.3):
      // the KR text input gets the focus, with a ring (S3-03)
      await expect(bar).toHaveCount(0);
      await expect(s.getByTestId('edit-kr-1')).toHaveValue('测试覆盖率提升到 90%');
      await expect(s.getByTestId('edit-kr-1')).toBeFocused();
      expect(await focusVisible(s)).toBe(true);
      await expect(s.locator('[data-draft-live]')).toHaveText('已恢复上次没保存的内容。');
      await both(s, 'S3-03-restored-focus');
      await s.getByTestId('tab-review').click();
      await expect(s.getByTestId('review-wentWell')).toHaveValue('发布流程更稳了');
      await expect(s.getByTestId('review-state')).toHaveText('有未保存的修改');
      expect(readdirSync(join(testInfo.outputPath('b'), 'profile', 'drafts'))).toEqual([
        'main.json',
      ]);
    } finally {
      b.app.process().kill('SIGKILL');
    }

    // ---------- launch C: 12 rows of deleted OKRs, review without a period, restore fails ----------
    await sql(electronApp, [`UPDATE objectives SET period = NULL WHERE id = '${okrId}'`]);
    const c = await relaunch(first, testInfo.outputPath('c'), mockServer.url, (drafts) => {
      wizardFile(drafts);
      const file = join(drafts, 'sticky.json');
      const data = JSON.parse(readFileSync(file, 'utf8'));
      const review = data.rows.find((r: { kind: string }) => r.kind === 'review');
      const gone = Array.from({ length: 12 }, (_, i) => ({ ...review, okrId: `deleted-${i}` }));
      writeFileSync(file, JSON.stringify({ ...data, rows: [review, ...gone] }));
    });
    try {
      const s = await openStickyOf(c.app, okrId);
      await setStickyWidth(c.app, 420);
      await expect(s.getByTestId('draft-bar')).toBeVisible({ timeout: 30_000 });
      await expect(s.getByTestId('draft-line').locator('[aria-hidden="true"]')).toHaveText([
        `「${SHOWN}」的复盘`,
      ]);
      await expect(s.getByTestId('draft-deleted')).toHaveText(
        '另有 12 条对应的内容已删除，无法恢复。',
      );
      await s.getByTestId('draft-deleted').scrollIntoViewIfNeeded();
      await both(s, 'S3-06-deleted-rows');

      // the drafts folder cannot be written: 恢复 fails, the bar and the draft stay (S3-05)
      const drafts = join(testInfo.outputPath('c'), 'profile', 'drafts');
      await expect(c.main.getByTestId('draft-bar')).toBeVisible();
      chmodSync(drafts, 0o555);
      try {
        await c.main.getByTestId('draft-restore').click();
        await expect(c.main.getByTestId('draft-error')).toHaveText('⚠ 没能恢复，请再试一次。');
        await expect(c.main.getByTestId('draft-error')).toHaveAttribute('role', 'alert');
        await expect(c.main.getByTestId('draft-restore')).toBeFocused();
        await expect(c.main.getByTestId('draft-bar')).toBeVisible();
        // rolled back: the goal is unchanged and 开始澄清 stays off
        await expect(c.main.getByTestId('intent-input')).toHaveValue('');
        await expect(c.main.getByTestId('start-clarification')).toBeDisabled();
        await both(c.main, 'S3-05-restore-failed');
      } finally {
        chmodSync(drafts, 0o755);
      }
    } finally {
      c.app.process().kill('SIGKILL');
    }

    // ---------- launch D: one review line without a period, nothing deleted (S3-08) ----------
    const d = await relaunch(first, testInfo.outputPath('d'), mockServer.url, (drafts) => {
      const file = join(drafts, 'sticky.json');
      const data = JSON.parse(readFileSync(file, 'utf8'));
      const review = data.rows.find((r: { kind: string }) => r.kind === 'review');
      writeFileSync(file, JSON.stringify({ ...data, rows: [review] }));
    });
    try {
      const s = await openStickyOf(d.app, okrId);
      await setStickyWidth(d.app, 420);
      await expect(s.getByTestId('draft-bar')).toBeVisible({ timeout: 30_000 });
      await expect(s.getByTestId('draft-line').locator('[aria-hidden="true"]')).toHaveText([
        `「${SHOWN}」的复盘`,
      ]);
      await expect(s.getByTestId('draft-deleted')).toHaveCount(0);
      await both(s, 'S3-08-review-no-period');
    } finally {
      d.app.process().kill('SIGKILL');
    }
  });
});
