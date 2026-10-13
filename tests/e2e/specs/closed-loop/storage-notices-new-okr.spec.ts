import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';

import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import {
  axe,
  expectDialogCentred,
  expectInert,
  openSticky,
  setTheme,
  shot,
} from '../../helpers/closed-loop';

/**
 * D1c: storage notices (memory bar / fresh-file / legacy), 「重启应用」 with its confirmation
 * and `relaunch_failed`, 「新建 OKR」 with the wizard confirmation, and the memory-mode suffix.
 *
 * The storage mode is produced the real way, before the app starts, in the folder of
 * E2E_DB_PATH (testInfo.outputPath):
 * - fresh-file: the database path is a directory and `backups` is a file, so the old path can
 *   be neither opened nor set aside → `clarityokr-fresh.db`;
 * - memory: the same, and `clarityokr-fresh.db` is a directory too → in-memory database;
 * - legacy notice: a pending `legacy-db-notice.json` (what a retired legacy database leaves).
 */

type Mode = 'normal' | 'fresh-file' | 'memory';

function prepare(dir: string, mode: Mode, legacyPending = false): void {
  mkdirSync(dir, { recursive: true });
  if (mode !== 'normal') {
    mkdirSync(join(dir, 'clarityokr.db', 'keep'), { recursive: true });
    writeFileSync(join(dir, 'backups'), 'not a folder');
  }
  if (mode === 'memory') {
    mkdirSync(join(dir, 'clarityokr-fresh.db', 'keep'), { recursive: true });
  }
  if (legacyPending) {
    writeFileSync(join(dir, 'legacy-db-notice.json'), JSON.stringify({ pending: true }));
  }
}

const storageMode = (page: Page): Promise<unknown> =>
  page.evaluate(() =>
    (
      window as unknown as { clarifyOkr: { invoke: (c: string) => Promise<unknown> } }
    ).clarifyOkr.invoke('clarityokr:app:storage-state'),
  );

/** Makes `app.relaunch` throw (what `relaunch_failed` reports) instead of restarting. */
async function breakRelaunch(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ app }) => {
    (app as unknown as { relaunch: () => void }).relaunch = () => {
      throw new Error('relaunch refused (e2e)');
    };
  });
}

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test.describe('D1c: memory mode', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture args.
  test.beforeEach(({}, testInfo) => prepare(testInfo.outputDir, 'memory'));

  test('memory bar in both windows, export from the bar, restart confirm + relaunch_failed, memory suffix', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    expect(await storageMode(mainWindow)).toEqual({ storageMode: 'memory' });
    const bar = mainWindow.getByTestId('memory-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('role', 'alert');
    await expect(bar).toContainText('数据无法保存');
    await expect(mainWindow.getByTestId('memory-restart')).toHaveText('重启应用');
    await shot(mainWindow, 'D1c-01-memory-bar-main');
    await axe(mainWindow, 'memory bar (main)');
    await setTheme(mainWindow, 'dark');
    await shot(mainWindow, 'D1c-02-memory-bar-main-dark');
    await axe(mainWindow, 'memory bar (main, dark)');
    await setTheme(mainWindow, 'light');

    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    const stickyBar = sticky.getByTestId('memory-bar');
    await expect(stickyBar).toBeVisible();
    await expect(sticky.getByTestId('memory-export')).toContainText('导出当前 OKR');
    // stays under the top bar, above the tabs, on every tab
    await sticky.getByTestId('tab-history').click();
    await expect(stickyBar).toBeVisible();
    await sticky.getByTestId('tab-note').click();
    await shot(sticky, 'D1c-03-memory-bar-sticky');
    await axe(sticky, 'memory bar (sticky)');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1c-04-memory-bar-sticky-dark');
    await axe(sticky, 'memory bar (sticky, dark)');
    await setTheme(sticky, 'light');

    // 「导出当前 OKR」 opens the same menu; Esc brings the focus back to it
    await sticky.getByTestId('memory-export').click();
    await expect(sticky.getByTestId('export-menu')).toBeVisible();
    await sticky.keyboard.press('Escape');
    await expect(sticky.getByTestId('export-menu')).toHaveCount(0);
    await expect(sticky.getByTestId('memory-export')).toBeFocused();

    // a real export from the bar: success toast names the OKR, focus back on 「导出当前 OKR」
    const exportPath = join(test.info().outputDir, 'memory-export.md');
    await electronApp.evaluate(({ dialog }, target) => {
      (dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    }, exportPath);
    await sticky.getByTestId('memory-export').click();
    await sticky.getByTestId('export-md').click();
    await expect(sticky.getByTestId('toast-success')).toContainText(
      '已导出「提高团队效率」为 Markdown：memory-export.md',
    );
    await expect(sticky.getByTestId('memory-export')).toBeFocused();
    await sticky.getByTestId('toast-close').click();

    // memory suffix on the review save
    await sticky.getByTestId('tab-review').click();
    await sticky.getByTestId('review-wentWell').fill('内存模式下写的复盘');
    await sticky.keyboard.press('Control+s');
    await expect(sticky.getByTestId('toast-success')).toContainText('复盘已保存（仅本次运行）。');
    await expect(sticky.getByTestId('review-state')).toContainText('已保存（仅本次运行）· ');
    await sticky.getByTestId('tab-note').click();

    // there is data: 「重启应用」 asks first (memory only → 「先不重启」 focused)
    await breakRelaunch(electronApp);
    const restart = sticky.getByTestId('memory-restart');
    await restart.click();
    const dialog = sticky.getByTestId('restart-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'alertdialog');
    await expect(dialog).toContainText('重启 ClarityOKR？');
    await expect(dialog).toContainText('重启后本次运行的内容会丢失。');
    await expect(sticky.getByTestId('dialog-cancel')).toBeFocused();
    await expect(sticky.getByTestId('dialog-cancel')).toHaveText('先不重启');
    await expectDialogCentred(sticky, 'restart-dialog');
    await expectInert(sticky, 'top-bar');
    await expectInert(sticky, 'memory-restart');
    await shot(sticky, 'D1c-05-restart-confirm');
    await axe(sticky, 'restart confirm');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1c-06-restart-confirm-dark');
    await axe(sticky, 'restart confirm (dark)');
    await setTheme(sticky, 'light');
    await sticky.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(restart).toBeFocused();

    // 「放弃并重启」 → relaunch_failed: one alert line, the focus stays on 「重启应用」
    await restart.click();
    await sticky.getByTestId('dialog-confirm').click();
    const failed = sticky.getByTestId('relaunch-failed');
    await expect(failed).toHaveCount(1);
    await expect(failed).toHaveAttribute('role', 'alert');
    await expect(failed).toHaveText('重启没有成功，请手动关闭后重新打开应用');
    await expect(restart).toBeFocused();
    await expect(restart).not.toHaveAttribute('aria-disabled', 'true');
    await shot(sticky, 'D1c-07-relaunch-failed');
    await axe(sticky, 'relaunch failed');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1c-08-relaunch-failed-dark');
    await axe(sticky, 'relaunch failed (dark)');
    await setTheme(sticky, 'light');

    // retry: still exactly one line
    await restart.click();
    await sticky.getByTestId('dialog-confirm').click();
    await expect(failed).toHaveCount(1);
    await expect(restart).toBeFocused();

    // a wizard draft in the MAIN window joins the reasons of a restart asked from the sticky one
    await mainWindow.bringToFront();
    const newOkr = mainWindow.getByTestId('intent-input');
    if ((await newOkr.count()) === 0) {
      await sticky.getByTestId('tab-history').click();
      await sticky.getByTestId('history-new-okr').click();
      await expect(newOkr).toBeVisible();
    }
    await newOkr.fill('还没写完的新目标');
    await expect
      .poll(async () => {
        await restart.click();
        const visible = await dialog.isVisible();
        const text = visible ? await dialog.textContent() : '';
        if (visible) await sticky.keyboard.press('Escape');
        return text;
      })
      .toContain('向导里已经填写的内容还没有保存，重启会丢掉这些内容。');
  });
});

test.describe('D1c: fresh-file mode', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture args.
  test.beforeEach(({}, testInfo) => prepare(testInfo.outputDir, 'fresh-file'));

  test('one-time notice in the main window; 「知道了」 hides it for this run', async ({
    mainWindow,
  }) => {
    expect(await storageMode(mainWindow)).toEqual({ storageMode: 'fresh-file' });
    const notice = mainWindow.getByTestId('fresh-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('role', 'status');
    await expect(notice).toContainText('旧数据没有载入，之后的内容会保存在新文件里。');
    await expect(notice).not.toContainText('备份');
    await expect(mainWindow.getByTestId('fresh-ack')).not.toBeFocused();
    await shot(mainWindow, 'D1c-09-fresh-notice');
    await axe(mainWindow, 'fresh notice');
    await setTheme(mainWindow, 'dark');
    await shot(mainWindow, 'D1c-10-fresh-notice-dark');
    await axe(mainWindow, 'fresh notice (dark)');
    await setTheme(mainWindow, 'light');
    await mainWindow.keyboard.press('Escape');
    await expect(notice).toBeVisible();
    await mainWindow.getByTestId('fresh-ack').click();
    await expect(notice).toHaveCount(0);
  });
});

test.describe('D1c: legacy notice', () => {
  let dir: string;
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture args.
  test.beforeEach(({}, testInfo) => {
    dir = testInfo.outputDir;
    prepare(dir, 'normal', true);
  });
  test.afterEach(() => {
    try {
      chmodSync(join(dir, 'legacy-db-notice.json'), 0o644);
    } catch {
      // already gone
    }
  });

  test('focus on 「知道了」; a failed ack keeps it with one alert line; the next ack closes it', async ({
    mainWindow,
  }) => {
    const notice = mainWindow.getByTestId('legacy-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('role', 'region');
    await expect(notice).toContainText('旧数据已保留，不会自动导入。');
    await expect(notice).not.toContainText('备份');
    await expect(mainWindow.getByTestId('legacy-ack')).toBeFocused();
    await shot(mainWindow, 'D1c-11-legacy-notice');
    await axe(mainWindow, 'legacy notice');
    await setTheme(mainWindow, 'dark');
    await shot(mainWindow, 'D1c-12-legacy-notice-dark');
    await axe(mainWindow, 'legacy notice (dark)');
    await setTheme(mainWindow, 'light');

    // the state file cannot be written → ack fails
    chmodSync(join(dir, 'legacy-db-notice.json'), 0o444);
    await mainWindow.keyboard.press('Escape'); // Esc = 知道了
    const failed = mainWindow.getByTestId('legacy-ack-failed');
    await expect(failed).toHaveCount(1);
    await expect(failed).toHaveAttribute('role', 'alert');
    await expect(failed).toContainText('没有保存成功，请再点一次「知道了」。');
    await expect(notice).toBeVisible();
    await mainWindow.getByTestId('legacy-ack').click();
    await expect(failed).toHaveCount(1);
    await shot(mainWindow, 'D1c-13-legacy-ack-failed');
    await axe(mainWindow, 'legacy ack failed');
    await setTheme(mainWindow, 'dark');
    await shot(mainWindow, 'D1c-14-legacy-ack-failed-dark');
    await axe(mainWindow, 'legacy ack failed (dark)');
    await setTheme(mainWindow, 'light');

    chmodSync(join(dir, 'legacy-db-notice.json'), 0o644);
    await mainWindow.getByTestId('legacy-ack').click();
    await expect(notice).toHaveCount(0);
    await expect(mainWindow.locator('#main-heading')).toBeFocused();
    await expect(mainWindow.getByTestId('notice-live')).toHaveText('已确认。');
  });
});

test.describe('D1c: 新建 OKR', () => {
  test('empty wizard resets directly; with input the main window asks (继续当前向导 / 重新开始)', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await sticky.getByTestId('tab-history').click();
    const newOkr = sticky.getByTestId('history-new-okr');
    await expect(newOkr).toHaveText('新建 OKR');
    await shot(sticky, 'D1c-15-history-new-okr');

    // completed wizard → not dirty → straight back to step one
    await newOkr.click();
    const intent = mainWindow.getByTestId('intent-input');
    await expect(intent).toBeVisible();
    await expect(intent).toHaveValue('');
    await expect(intent).toBeFocused();
    await expect(mainWindow.getByTestId('new-okr-dialog')).toHaveCount(0);

    // with input → the dialog in the main window, safe answer focused
    await intent.fill('提升客户满意度');
    await newOkr.click();
    const dialog = mainWindow.getByTestId('new-okr-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'alertdialog');
    await expect(dialog).toContainText('重新开始一个新的 OKR？');
    await expect(dialog).toContainText('向导里已经填写的内容还没有保存，重新开始会丢掉这些内容。');
    await expect(mainWindow.getByTestId('dialog-cancel')).toHaveText('继续当前向导');
    await expect(mainWindow.getByTestId('dialog-cancel')).toBeFocused();
    await expect(mainWindow.getByTestId('dialog-confirm')).toHaveText('重新开始');
    await expectDialogCentred(mainWindow, 'new-okr-dialog');
    await expectInert(mainWindow, 'intent-input');
    // digits typed while the dialog is open do not reach the wizard / page
    await shot(mainWindow, 'D1c-16-new-okr-confirm');
    await axe(mainWindow, 'new okr confirm');
    await setTheme(mainWindow, 'dark');
    await shot(mainWindow, 'D1c-17-new-okr-confirm-dark');
    await axe(mainWindow, 'new okr confirm (dark)');
    await setTheme(mainWindow, 'light');

    // Esc = 继续当前向导: nothing lost
    await mainWindow.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(intent).toHaveValue('提升客户满意度');

    // 重新开始: empty, focus in the first field
    await newOkr.click();
    await expect(dialog).toBeVisible();
    await mainWindow.getByTestId('dialog-confirm').click();
    await expect(dialog).toHaveCount(0);
    await expect(intent).toHaveValue('');
    await expect(intent).toBeFocused();
  });
});
