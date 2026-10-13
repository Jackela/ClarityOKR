import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';

import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';
import {
  axe,
  expectDialogCentred,
  expectInert,
  invoke,
  mockFor,
  openSticky,
  setTheme,
  shot,
} from '../../helpers/closed-loop';

/**
 * D2 (release gate, spec §1.2a / §1.2b / §1.2c / §7a.4): the sticky top bar (drag area,
 * 「⋯」 with 窗口始终在最前, 「隐藏」), recall without the menu accelerator (second instance, app
 * menu 显示便签, main window 重开便签), quit confirmation fed by the unsaved state of BOTH
 * windows, and the restart dialog in the main window.
 *
 * The real `app.quit` is replaced with a counter before any quit is asked, so a confirmed quit
 * is observed instead of ending the test app (the fixtures end it with `app.exit`). The tray
 * itself cannot be clicked from Playwright; its menu shares the actions tested here (unit tests
 * cover its wiring) and it is 未实测 on real desktops.
 */

const STICKY_TITLE = 'ClarityOKR Sticky';

async function stubQuit(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ app }) => {
    const g = globalThis as unknown as { __quitCalls: number };
    g.__quitCalls = 0;
    (app as unknown as { quit: () => void }).quit = () => {
      g.__quitCalls += 1;
    };
  });
}

const quitCalls = (electronApp: ElectronApplication): Promise<number> =>
  electronApp.evaluate(() => (globalThis as unknown as { __quitCalls: number }).__quitCalls);

/** Clicks an item of the application menu (what ⌘Q / the menu do). */
async function clickAppMenu(electronApp: ElectronApplication, label: string): Promise<void> {
  await electronApp.evaluate(({ Menu }, itemLabel) => {
    const items = Menu.getApplicationMenu()?.items.flatMap((i) => i.submenu?.items ?? []) ?? [];
    const item = items.find((i) => i.label === itemLabel);
    if (!item) throw new Error(`no menu item ${itemLabel}`);
    (item as unknown as { click: () => void }).click();
  }, label);
}

const stickyState = (electronApp: ElectronApplication) =>
  electronApp.evaluate(({ BrowserWindow }, title) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === title);
    return w ? { visible: w.isVisible(), onTop: w.isAlwaysOnTop() } : null;
  }, STICKY_TITLE);

const appRegion = (page: Page, selector: string): Promise<string> =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'missing';
    const style = getComputedStyle(el);
    return (
      style.getPropertyValue('-webkit-app-region') ||
      style.getPropertyValue('app-region') ||
      'none'
    ).trim();
  }, selector);

async function openWizardDraft(mainWindow: Page, sticky: Page, text: string): Promise<void> {
  const intent = mainWindow.getByTestId('intent-input');
  if ((await intent.count()) === 0) {
    // what 「新建 OKR」 sends; the review tab (with its draft) stays as it is
    await invoke(sticky, 'clarityokr:window:open-wizard');
    await expect(intent).toBeVisible();
  }
  await intent.fill(text);
}

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test.describe('D2: sticky top bar, hide and recall', () => {
  test('drag area, Tab order, 「⋯」 always-on-top switch, 「隐藏」 without a dialog, recall paths', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);

    // §1.2a: the bar drags, every control in it does not
    expect(await appRegion(sticky, '[data-testid="top-bar"]')).toBe('drag');
    for (const id of ['export-button', 'more-button', 'hide-button']) {
      expect(await appRegion(sticky, `[data-testid="${id}"]`), id).toBe('no-drag');
    }
    expect(await appRegion(sticky, '[role="tablist"]')).not.toBe('drag');

    // 32×32 hide button, line icon, name + tooltip on keyboard focus; order 导出 → 更多 → 隐藏
    const hide = sticky.getByTestId('hide-button');
    const box = await hide.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(32);
    expect(box!.height).toBeGreaterThanOrEqual(32);
    await expect(hide).toHaveAttribute('aria-label', '隐藏便签');
    await sticky.getByTestId('export-button').focus();
    await sticky.keyboard.press('Tab');
    await expect(sticky.getByTestId('more-button')).toBeFocused();
    await sticky.keyboard.press('Tab');
    await expect(hide).toBeFocused();
    const tooltip = sticky.getByTestId('hide-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText('隐藏便签（应用仍在运行，不是退出）');
    await shot(sticky, 'D2-01-top-bar-hide-tooltip');
    await axe(sticky, 'top bar with the hide tooltip');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D2-02-top-bar-hide-tooltip-dark');
    await axe(sticky, 'top bar with the hide tooltip (dark)');
    await setTheme(sticky, 'light');

    // 「⋯」: menu with the checked 窗口始终在最前 switch; toggling changes the real window
    expect(await stickyState(electronApp)).toEqual({ visible: true, onTop: true });
    await sticky.getByTestId('more-button').click();
    const onTop = sticky.getByTestId('always-on-top');
    await expect(onTop).toBeFocused();
    await expect(onTop).toHaveAttribute('role', 'menuitemcheckbox');
    await expect(onTop).toHaveAttribute('aria-checked', 'true');
    await shot(sticky, 'D2-03-more-menu');
    await axe(sticky, 'more menu');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D2-04-more-menu-dark');
    await axe(sticky, 'more menu (dark)');
    await setTheme(sticky, 'light');
    await sticky.keyboard.press('Space');
    await expect(onTop).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => (await stickyState(electronApp))?.onTop).toBe(false);
    await onTop.click();
    await expect(onTop).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await stickyState(electronApp))?.onTop).toBe(true);
    await sticky.keyboard.press('Escape');
    await expect(sticky.getByTestId('more-menu')).toHaveCount(0);
    await expect(sticky.getByTestId('more-button')).toBeFocused();

    // 「隐藏」 keeps unsaved review text, asks nothing, and the app keeps running
    await sticky.getByTestId('tab-review').click();
    await sticky.getByTestId('review-wentWell').fill('隐藏前写的复盘');
    await hide.click();
    await expect.poll(async () => (await stickyState(electronApp))?.visible).toBe(false);
    await expect(sticky.locator('[role="alertdialog"]')).toHaveCount(0);
    await expect(mainWindow.locator('[role="alertdialog"]')).toHaveCount(0);

    // recall 1: a second launch (single instance) shows it, with the text still there
    await electronApp.evaluate(({ app }) => {
      app.emit('second-instance', {}, [], process.cwd(), {});
    });
    await expect.poll(async () => (await stickyState(electronApp))?.visible).toBe(true);
    await expect(sticky.getByTestId('review-wentWell')).toHaveValue('隐藏前写的复盘');

    // recall 2: the app menu 显示便签
    await hide.click();
    await expect.poll(async () => (await stickyState(electronApp))?.visible).toBe(false);
    await clickAppMenu(electronApp, '显示便签');
    await expect.poll(async () => (await stickyState(electronApp))?.visible).toBe(true);

    // recall 3: the main window 重开便签 (always enabled)
    await hide.click();
    await expect.poll(async () => (await stickyState(electronApp))?.visible).toBe(false);
    const reopen = mainWindow.getByTestId('sticky-reopen');
    await expect(reopen).toHaveText('重开便签');
    await reopen.click();
    await expect.poll(async () => (await stickyState(electronApp))?.visible).toBe(true);

    // the app menu carries 显示便签 (CmdOrCtrl+Shift+K) and 退出
    const menu = await electronApp.evaluate(({ Menu }) =>
      (Menu.getApplicationMenu()?.items[0]?.submenu?.items ?? [])
        .filter((i) => i.type !== 'separator')
        .map((i) => [i.label, i.accelerator ?? '']),
    );
    expect(menu).toEqual([
      ['显示便签', 'CmdOrCtrl+Shift+K'],
      ['退出', 'CmdOrCtrl+Q'],
    ]);
  });
});

test.describe('D2: quit confirmation from both windows (§1.2c)', () => {
  test('nothing unsaved: 退出 quits at once without a dialog', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    await openSticky(electronApp, mainWindow, mockServer);
    await stubQuit(electronApp);
    await clickAppMenu(electronApp, '退出');
    await expect.poll(() => quitCalls(electronApp)).toBe(1);
    await expect(mainWindow.locator('[role="alertdialog"]')).toHaveCount(0);
  });

  test('review draft only: the hidden sticky window comes back and hosts the dialog', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await stubQuit(electronApp);
    await sticky.getByTestId('tab-review').click();
    await sticky.getByTestId('review-wentWell').fill('还没保存的复盘');
    await sticky.getByTestId('hide-button').click();
    await expect.poll(async () => (await stickyState(electronApp))?.visible).toBe(false);

    await clickAppMenu(electronApp, '退出');
    await expect.poll(async () => (await stickyState(electronApp))?.visible).toBe(true);
    const dialog = sticky.getByTestId('quit-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'alertdialog');
    await expect(dialog).toContainText('退出 ClarityOKR？');
    await expect(dialog).toContainText('复盘里写的内容还没有保存，退出会丢掉这些内容。');
    await expect(sticky.getByTestId('dialog-cancel')).toHaveText('继续编辑');
    await expect(sticky.getByTestId('dialog-cancel')).toBeFocused();
    await expect(sticky.getByTestId('dialog-confirm')).toHaveText('放弃并退出');
    await expect(mainWindow.getByTestId('quit-dialog')).toHaveCount(0);
    await expectDialogCentred(sticky, 'quit-dialog');
    await expectInert(sticky, 'top-bar');
    await shot(sticky, 'D2-05-quit-confirm-sticky');
    await axe(sticky, 'quit confirm (sticky)');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D2-06-quit-confirm-sticky-dark');
    await axe(sticky, 'quit confirm (sticky, dark)');
    await setTheme(sticky, 'light');

    // asking again (tray / ⌘Q) while it is open does not stack a second dialog
    await clickAppMenu(electronApp, '退出');
    await expect(sticky.getByTestId('quit-dialog')).toHaveCount(1);

    // Esc = 继续编辑: nothing quits, the text is still there
    await sticky.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await quitCalls(electronApp)).toBe(0);
    await expect(sticky.getByTestId('review-wentWell')).toHaveValue('还没保存的复盘');

    // a wizard draft in the main window as well → both shown, dialog in the MAIN window
    await openWizardDraft(mainWindow, sticky, '还没写完的新目标');
    await clickAppMenu(electronApp, '退出');
    const mainDialog = mainWindow.getByTestId('quit-dialog');
    await expect(mainDialog).toBeVisible();
    await expect(sticky.getByTestId('quit-dialog')).toHaveCount(0);
    await expect(mainWindow.locator('.dialog__body')).toHaveText(
      [
        '向导里已经填写的内容还没有保存，退出会丢掉这些内容。',
        '复盘里写的内容还没有保存，退出会丢掉这些内容。',
      ].join('\n'),
    );
    await expect(mainWindow.getByTestId('dialog-cancel')).toBeFocused();
    await expectDialogCentred(mainWindow, 'quit-dialog');
    await mainWindow.evaluate(() => window.scrollTo(0, 0));
    await shot(mainWindow, 'D2-07-quit-confirm-main-two-reasons');
    await axe(mainWindow, 'quit confirm (main)');
    await setTheme(mainWindow, 'dark');
    await shot(mainWindow, 'D2-08-quit-confirm-main-two-reasons-dark');
    await axe(mainWindow, 'quit confirm (main, dark)');
    await setTheme(mainWindow, 'light');
    expect(await stickyState(electronApp)).toMatchObject({ visible: true });

    // 放弃并退出 → the app quits
    await mainWindow.getByTestId('dialog-confirm').click();
    await expect.poll(() => quitCalls(electronApp)).toBe(1);
    await expect(mainDialog).toHaveCount(0);
  });
});

type Mode = 'memory';
function prepare(dir: string, mode: Mode): void {
  mkdirSync(dir, { recursive: true });
  if (mode === 'memory') {
    mkdirSync(join(dir, 'clarityokr.db', 'keep'), { recursive: true });
    writeFileSync(join(dir, 'backups'), 'not a folder');
    mkdirSync(join(dir, 'clarityokr-fresh.db', 'keep'), { recursive: true });
  }
}

test.describe('D2: memory mode — restart dialog in the main window, quit with wizard + memory', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture args.
  test.beforeEach(({}, testInfo) => prepare(testInfo.outputDir, 'memory'));

  test('memory only, then a wizard in the middle of its questions joins both dialogs', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await stubQuit(electronApp);
    await electronApp.evaluate(({ app }) => {
      (app as unknown as { relaunch: () => void }).relaunch = () => {
        throw new Error('relaunch refused (e2e)');
      };
    });
    const restart = sticky.getByTestId('memory-restart');
    const dialog = mainWindow.getByTestId('restart-dialog');
    const body = mainWindow.locator('.dialog__body');

    // 1. memory only (the wizard's input already became the OKR): one line, 「先不重启」
    await restart.click();
    await expect(dialog).toBeVisible();
    await expect(sticky.getByTestId('restart-dialog')).toHaveCount(0);
    await expect(body).toHaveText('重启后本次运行的内容会丢失。');
    await expect(mainWindow.getByTestId('dialog-cancel')).toHaveText('先不重启');
    await expect(mainWindow.getByTestId('dialog-cancel')).toBeFocused();
    await expect(restart).toHaveAttribute('aria-disabled', 'true');
    await mainWindow.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(restart).toBeFocused();
    await expect(restart).not.toHaveAttribute('aria-disabled', 'true');

    // 放弃并重启 → relaunch_failed is shown in the sticky window that asked
    await restart.click();
    await mainWindow.getByTestId('dialog-confirm').click();
    await expect(sticky.getByTestId('relaunch-failed')).toHaveCount(1);
    await expect(restart).toBeFocused();
    await expect(mainWindow.getByTestId('relaunch-failed')).toHaveCount(0);

    // quit, memory only: 「先不退出」
    await clickAppMenu(electronApp, '退出');
    const quit = mainWindow.getByTestId('quit-dialog');
    await expect(body).toHaveText('本次运行的内容没有保存到文件，退出后会全部丢失。');
    await expect(mainWindow.getByTestId('dialog-cancel')).toHaveText('先不退出');
    await mainWindow.keyboard.press('Escape');
    await expect(quit).toHaveCount(0);

    // 2. a NEW clarification in the middle of its questions (not generated yet)
    await invoke(sticky, 'clarityokr:window:open-wizard');
    const clarification = new ClarificationPage(mainWindow);
    await mockServer.setResponses(mockFor('缩短交付周期'));
    await clarification.startClarification('第二个目标：缩短交付周期');
    await clarification.waitForOptions();
    await clarification.answerQuestion(0);
    await clarification.waitForOptions();
    // question 2 is on screen (not the loading placeholder)
    await expect(mainWindow.getByTestId('prompt-question')).toBeVisible();
    await expect(mainWindow.getByTestId('clarification-option').first()).toBeVisible();

    // restart from the sticky note: wizard line first, then the memory line; 「继续编辑」
    await restart.click();
    await expect(dialog).toBeVisible();
    await expect(body).toHaveText(
      ['向导里已经填写的内容还没有保存，重启会丢掉这些内容。', '重启后本次运行的内容会丢失。'].join(
        '\n',
      ),
    );
    await expect(mainWindow.getByTestId('dialog-cancel')).toHaveText('继续编辑');
    await expect(mainWindow.getByTestId('dialog-cancel')).toBeFocused();
    await expectDialogCentred(mainWindow, 'restart-dialog');
    await expectInert(mainWindow, 'memory-bar');
    await mainWindow.evaluate(() => window.scrollTo(0, 0));
    await shot(mainWindow, 'D2-09-restart-confirm-main');
    await axe(mainWindow, 'restart confirm (main)');
    await setTheme(mainWindow, 'dark');
    await shot(mainWindow, 'D2-10-restart-confirm-main-dark');
    await axe(mainWindow, 'restart confirm (main, dark)');
    await setTheme(mainWindow, 'light');
    await mainWindow.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(restart).toBeFocused();

    // quit: the same two lines in the quit wording, 「继续编辑」
    await clickAppMenu(electronApp, '退出');
    await expect(quit).toBeVisible();
    await expect(body).toHaveText(
      [
        '向导里已经填写的内容还没有保存，退出会丢掉这些内容。',
        '本次运行的内容没有保存到文件，退出后会全部丢失。',
      ].join('\n'),
    );
    await expect(mainWindow.getByTestId('dialog-cancel')).toHaveText('继续编辑');
    await mainWindow.evaluate(() => window.scrollTo(0, 0));
    await shot(mainWindow, 'D2-11-quit-confirm-wizard-memory');
    await axe(mainWindow, 'quit confirm wizard + memory');
    await setTheme(mainWindow, 'dark');
    await shot(mainWindow, 'D2-12-quit-confirm-wizard-memory-dark');
    await axe(mainWindow, 'quit confirm wizard + memory (dark)');
    await setTheme(mainWindow, 'light');
    await mainWindow.keyboard.press('Escape');
    await expect(quit).toHaveCount(0);
    expect(await quitCalls(electronApp)).toBe(0);
  });
});

test.describe('D2: closing the main window only hides it (B2, spec v2.8 §1.2c)', () => {
  test('wizard draft survives a close: no confirm, flag kept, the quit confirm still names it', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await stubQuit(electronApp);
    await openWizardDraft(mainWindow, sticky, '关窗前写的目标');

    const mainState = () =>
      electronApp.evaluate(({ BrowserWindow }, title) => {
        const w = BrowserWindow.getAllWindows().find(
          (x) => !x.isDestroyed() && x.getTitle() !== title,
        );
        return w ? { exists: true, visible: w.isVisible() } : { exists: false, visible: false };
      }, STICKY_TITLE);

    // the window's close button
    await electronApp.evaluate(({ BrowserWindow }, title) => {
      BrowserWindow.getAllWindows()
        .find((x) => x.getTitle() !== title)
        ?.close();
    }, STICKY_TITLE);
    await expect.poll(mainState).toEqual({ exists: true, visible: false });
    await expect(mainWindow.locator('[role="alertdialog"]')).toHaveCount(0);
    await expect(sticky.locator('[role="alertdialog"]')).toHaveCount(0);
    expect(await quitCalls(electronApp)).toBe(0);

    // recall through the quit path: the unsaved flag was not cleared, the draft is there
    await clickAppMenu(electronApp, '退出');
    await expect.poll(mainState).toEqual({ exists: true, visible: true });
    await expect(mainWindow.getByTestId('quit-dialog')).toContainText(
      '向导里已经填写的内容还没有保存，退出会丢掉这些内容。',
    );
    await mainWindow.keyboard.press('Escape');
    await expect(mainWindow.getByTestId('intent-input')).toHaveValue('关窗前写的目标');
    expect(await quitCalls(electronApp)).toBe(0);
  });
});
