import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
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

/** CI keeps the S3§12 shots as a workflow artifact (S3_12_SHOTS_DIR set in ci.yml). */
async function ciShot(page: Page, name: string): Promise<void> {
  const dir = process.env.S3_12_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

async function both(page: Page, name: string): Promise<void> {
  await shot(page, `${name}-light`);
  await ciShot(page, `${name}-light`);
  await setTheme(page, 'dark');
  await shot(page, `${name}-dark`);
  await ciShot(page, `${name}-dark`);
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
    // and key result 1 in the main window's own text edit (产品经理 decision 2①)
    const summary = mainWindow.getByTestId('okr-summary');
    await summary.getByTestId('edit-button').click();
    await summary.getByTestId('edit-kr-0').fill('主窗口改的关键结果');

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
    const mainFile = join(profile, 'drafts', 'main.json');
    await expect
      .poll(() => {
        try {
          return (
            JSON.parse(readFileSync(mainFile, 'utf8')) as { rows: { kind: string }[] }
          ).rows.map((r) => r.kind);
        } catch {
          return [];
        }
      })
      .toEqual(['textEdit']);
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
        // and its validation state: no 「请输入至少3个字符」 hint
        await c.main.waitForTimeout(300);
        await expect(c.main.locator('#intent-error')).toHaveCount(0);
        await expect(c.main.getByText('请输入至少3个字符')).toHaveCount(0);
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

    // ---------- launch E: the main window's own KR text edit, 1200 wide (S3-09a / S3-09b) ----------
    const e = await relaunch(first, testInfo.outputPath('e'), mockServer.url, (drafts) => {
      rmSync(join(drafts, 'sticky.json'));
    });
    try {
      await e.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => !x.isAlwaysOnTop())!;
        w.setSize(1200, 800);
      });
      const bar = e.main.getByTestId('draft-bar');
      await expect(bar).toBeVisible({ timeout: 30_000 });
      const line = e.main.getByTestId('draft-line');
      await expect(line.locator('[aria-hidden="true"]')).toHaveText([
        `「${SHOWN}」第 1 个关键结果的文字`,
      ]);
      await expect(e.main.getByTestId('draft-restore')).toBeFocused();
      // 1200 wide: the buttons sit to the right of the text
      const text = (await line.first().boundingBox())!;
      const restore = (await e.main.getByTestId('draft-restore').boundingBox())!;
      expect(restore.x).toBeGreaterThan(text.x + text.width);
      // the bar is only in the window that owns the draft
      const s = await openStickyOf(e.app, okrId);
      await s.getByTestId('kr-list').waitFor({ state: 'visible' });
      await s.waitForTimeout(1000);
      await expect(s.getByTestId('draft-bar')).toHaveCount(0);
      await e.main.bringToFront();
      await e.main.getByTestId('draft-restore').focus();
      await both(e.main, 'S3-09a-main-bar-text-edit');

      await e.main.getByTestId('draft-restore').click();
      await expect(bar).toHaveCount(0);
      const kr = e.main.getByTestId('okr-summary').getByTestId('edit-kr-0');
      await expect(kr).toHaveValue('主窗口改的关键结果');
      await expect(kr).toBeFocused();
      expect(await focusVisible(e.main)).toBe(true);
      await both(e.main, 'S3-09b-main-restored-focus');
    } finally {
      e.app.process().kill('SIGKILL');
    }

    // ---------- launch F: wizard + KR text edit in the main window → focus on the wizard goal ----------
    const f = await relaunch(first, testInfo.outputPath('f'), mockServer.url, (drafts) => {
      rmSync(join(drafts, 'sticky.json'));
      const file = join(drafts, 'main.json');
      const data = JSON.parse(readFileSync(file, 'utf8'));
      writeFileSync(
        file,
        JSON.stringify({
          ...data,
          rows: [{ kind: 'wizard', step: 1, intent: '提高团队效率' }, ...data.rows],
        }),
      );
    });
    try {
      await expect(f.main.getByTestId('draft-line')).toHaveCount(2, { timeout: 30_000 });
      await f.main.getByTestId('draft-restore').click();
      await expect(f.main.getByTestId('draft-bar')).toHaveCount(0);
      await expect(f.main.getByTestId('intent-input')).toHaveValue('提高团队效率');
      await expect(f.main.getByTestId('intent-input')).toBeFocused();
      await expect(f.main.getByTestId('okr-summary').getByTestId('edit-kr-0')).toHaveValue(
        '主窗口改的关键结果',
      );
    } finally {
      f.app.process().kill('SIGKILL');
    }

    // ---------- launch G: the draft's OKR is not the one shown, which has unsaved edits ----------
    // 恢复 → 「放弃未保存的修改？」 (§3.9, S3-13) → 放弃修改 → switch + restore, focus on the KR (S3-14)
    const g = await relaunch(first, testInfo.outputPath('g'), mockServer.url, (drafts) => {
      rmSync(join(drafts, 'sticky.json'));
    });
    try {
      await g.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => !x.isAlwaysOnTop())!;
        w.setSize(1200, 800);
      });
      await expect(g.main.getByTestId('draft-bar')).toBeVisible({ timeout: 30_000 });
      // another OKR becomes the one shown in the main window
      await mockServer.setResponses(mockFor('另一个目标：缩短上线等待时间'));
      const wizard = new ClarificationPage(g.main);
      await wizard.waitForReady();
      await wizard.completeClarificationFlow('缩短上线等待', {
        questionCount: 2,
        selectOptionIndex: 0,
        finalOptionIndex: 1,
      });
      await wizard.waitForOkrSummary(30000);
      const summary = g.main.getByTestId('okr-summary');
      await expect(summary).toContainText('另一个目标');
      await summary.getByTestId('edit-button').click();
      await summary.getByTestId('edit-kr-0').fill('另一个目标上没保存的修改');

      await g.main.getByTestId('draft-restore').click();
      const confirm = g.main.getByTestId('discard-dialog');
      await expect(confirm).toBeVisible();
      await expect(confirm).toContainText('放弃未保存的修改？');
      // default focus on 「继续编辑」, 「放弃修改」 is the danger button
      await expect(confirm.getByTestId('dialog-cancel')).toHaveText('继续编辑');
      await expect(confirm.getByTestId('dialog-cancel')).toBeFocused();
      await expect(confirm.getByTestId('dialog-confirm')).toHaveText('放弃修改');
      await expect(confirm.getByTestId('dialog-confirm')).toHaveClass(/dialog__btn--danger/);
      // 「恢复中」 while it switches and restores
      await expect(g.main.getByTestId('draft-restore')).toHaveAttribute('aria-busy', 'true');
      await both(g.main, 'S3-13-switch-discard-confirm');

      await confirm.getByTestId('dialog-confirm').click();
      await expect(g.main.getByTestId('draft-bar')).toHaveCount(0);
      await expect(summary).not.toContainText('另一个目标');
      const kr = summary.getByTestId('edit-kr-0');
      await expect(kr).toHaveValue('主窗口改的关键结果');
      await expect(kr).toBeFocused();
      expect(await focusVisible(g.main)).toBe(true);
      await expect(g.main.locator('[data-draft-live]')).toHaveText('已恢复上次没保存的内容。');
      await both(g.main, 'S3-14-switched-restored-focus');
    } finally {
      g.app.process().kill('SIGKILL');
    }

    // ---------- launch H (#117): objective text + KR text + added KR (S3-10 / S3-10b) ----------
    const structural = (drafts: string, window: 'main' | 'sticky'): void => {
      const data = JSON.parse(readFileSync(join(drafts, 'main.json'), 'utf8'));
      const textEdit = data.rows.filter((r: { kind: string }) => r.kind === 'textEdit');
      writeFileSync(
        join(drafts, `${window}.json`),
        JSON.stringify({
          version: 1,
          window,
          savedAt: new Date().toISOString(),
          rows: [
            { kind: 'objective', okrId, base: LONG, draft: '恢复回来的目标文字' },
            ...textEdit,
            {
              kind: 'addedKr',
              okrId,
              krs: [{ id: 'e2e-added-kr', statement: '恢复回来的新关键结果', successMetric: '' }],
            },
          ],
        }),
      );
    };
    const threeLines = [
      `「${SHOWN}」的目标文字`,
      `「${SHOWN}」第 1 个关键结果的文字`,
      `「${SHOWN}」新加的关键结果`,
    ];
    const h = await relaunch(first, testInfo.outputPath('h'), mockServer.url, (drafts) => {
      rmSync(join(drafts, 'sticky.json'));
      structural(drafts, 'main');
    });
    try {
      await h.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => !x.isAlwaysOnTop())!;
        w.setSize(1200, 800);
      });
      await expect(h.main.getByTestId('draft-bar')).toBeVisible({ timeout: 30_000 });
      await expect(h.main.getByTestId('draft-line').locator('[aria-hidden="true"]')).toHaveText(
        threeLines,
      );
      await h.main.getByTestId('draft-restore').focus();
      await both(h.main, 'S3-10-main-bar-objective-kr-added');

      await h.main.getByTestId('draft-restore').click();
      await expect(h.main.getByTestId('draft-bar')).toHaveCount(0);
      const summary = h.main.getByTestId('okr-summary');
      const objective = summary.getByTestId('edit-objective');
      await expect(objective).toHaveValue('恢复回来的目标文字');
      await expect(summary.getByTestId('edit-kr-0')).toHaveValue('主窗口改的关键结果');
      await expect(summary.getByTestId('edit-kr').last().locator('textarea').first()).toHaveValue(
        '恢复回来的新关键结果',
      );
      // focus on the first kind restored: the objective input, with a ring (S3§12.7)
      await expect(objective).toBeFocused();
      expect(await focusVisible(h.main)).toBe(true);
      await both(h.main, 'S3-10b-restored-focus-objective');
    } finally {
      h.app.process().kill('SIGKILL');
    }

    // ---------- launch I (#117): the same three lines in the 420-wide sticky window (S3-10) ----------
    const i = await relaunch(first, testInfo.outputPath('i'), mockServer.url, (drafts) => {
      structural(drafts, 'sticky');
      rmSync(join(drafts, 'main.json'));
    });
    try {
      const s = await openStickyOf(i.app, okrId);
      await setStickyWidth(i.app, 420);
      await expect(s.getByTestId('draft-bar')).toBeVisible({ timeout: 30_000 });
      await expect(s.getByTestId('draft-line').locator('[aria-hidden="true"]')).toHaveText(
        threeLines,
      );
      // no line runs out of the bar sideways (nowrap unchanged, S3§12.7 v4.0)
      const overflow = await s
        .getByTestId('draft-line')
        .evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
      expect(overflow).toBe(0);
      await both(s, 'S3-10-sticky-420-objective-kr-added');
    } finally {
      i.app.process().kill('SIGKILL');
    }
  });
});
