import type { ElectronApplication, Page } from '@playwright/test';

import { test, expect } from '../../fixtures';
import {
  axe,
  expectDialogCentred,
  invoke,
  mockFor,
  openSticky,
  setTheme,
  shot,
} from '../../helpers/closed-loop';

/**
 * D3: regenerate UX (spec §3.7) end to end against the real main process and SQLite (the LLM
 * is the mock server), plus N15 (no tray icon: 「隐藏」 on the last visible window quits).
 */

const STICKY_TITLE = 'ClarityOKR Sticky';

async function keyResultIds(sticky: Page): Promise<{ okrId: string; ids: string[] }> {
  const list = await invoke(sticky, 'clarityokr:okr:list');
  const okrId = list.data.items[0].id as string;
  const open = await invoke(sticky, 'clarityokr:okr:open', { okrId });
  const ids = (
    open.data.objective.keyResults as Array<{
      id: string;
      position: number;
      removedAt: string | null;
    }>
  )
    .filter((k) => k.removedAt === null)
    .sort((a, b) => a.position - b.position)
    .map((k) => k.id);
  return { okrId, ids };
}

const draftOf = (
  krs: Array<{ id: string; statement: string; target: string; measurement: string }>,
) => ({
  draft: { objectives: [{ id: 'o1', title: '提高团队效率', keyResults: krs }] },
});

const refresh = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

const statements = (sticky: Page) =>
  sticky
    .getByTestId('sticky-key-result')
    .getByTestId('kr-statement')
    .allTextContents()
    .then((texts) => texts.map((t) => t.trim()));

test.describe('D3: regenerate (§3.7)', () => {
  test('menu, confirm, result banner with 新增 / 已移除, selection mode, failure, running', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    test.setTimeout(120_000);
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    const { ids } = await keyResultIds(sticky);
    expect(ids).toHaveLength(3);
    const [k1, k2] = ids as [string, string, string];
    await invoke(sticky, 'clarityokr:kr:set-progress', {
      krId: k1,
      status: 'in_progress',
      value: 40,
    });
    await refresh(sticky);
    await expect(sticky.getByTestId('kr-progress-value').first()).toContainText('40%');

    // The model returns k1 (rewritten), one key result without a known id, and k2: k3 goes.
    await mockServer.setResponses({
      ...mockFor('提高团队效率'),
      regenerate: draftOf([
        { id: k1, statement: '代码评审在一天内完成', target: '1天', measurement: '评审耗时' },
        {
          id: 'model-new-1',
          statement: '每周至少一次结对编程',
          target: '1次',
          measurement: '每周',
        },
        { id: k2, statement: '测试覆盖率提升到 85%', target: '85%', measurement: '覆盖率' },
      ]),
    } as never);

    // Entry: menu with the two items
    const button = sticky.getByTestId('regenerate-button');
    await expect(button).toHaveAttribute('aria-haspopup', 'menu');
    await button.click();
    await expect(sticky.getByTestId('regenerate-button-option-0')).toHaveText(
      /重新生成选中的关键结果…/,
    );
    await expect(sticky.getByTestId('regenerate-button-option-1')).toHaveText(
      /重新生成全部关键结果…/,
    );
    await shot(sticky, 'D3-01-regenerate-menu');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D3-02-regenerate-menu-dark');
    await setTheme(sticky, 'light');

    // All: the danger confirm, 取消 focused
    await sticky.getByTestId('regenerate-button-option-1').click();
    const dialog = sticky.getByTestId('regen-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('重新生成全部关键结果？');
    await expect(sticky.getByTestId('dialog-cancel')).toBeFocused();
    await expectDialogCentred(sticky, 'regen-dialog');
    await shot(sticky, 'D3-03-regenerate-confirm-all');
    await axe(sticky, 'regenerate confirm');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D3-04-regenerate-confirm-all-dark');
    await setTheme(sticky, 'light');
    await sticky.getByTestId('dialog-confirm').click();

    const banner = sticky.getByTestId('regen-banner');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toHaveAttribute('role', 'status');
    await expect(banner).toContainText('重新生成完成：保留 2 条，新增 1 条，移除 1 条。');
    await expect(banner).toContainText('其中 1 条没有返回编号，已按新增处理');
    expect(await statements(sticky)).toEqual([
      '代码评审在一天内完成',
      expect.stringContaining('每周至少一次结对编程'),
      '测试覆盖率提升到 85%',
    ]);
    await expect(sticky.getByTestId('kr-new-tag')).toHaveCount(1);
    // progress and status stay with k1
    await expect(sticky.getByTestId('kr-progress-value').first()).toContainText('40%');
    await expect(sticky.getByTestId('removed-section')).toBeVisible();
    await shot(sticky, 'D3-05-regenerate-result-banner');
    await axe(sticky, 'regenerate banner');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D3-06-regenerate-result-banner-dark');
    await setTheme(sticky, 'light');
    await sticky.getByTestId('regen-view-removed').click();
    await expect(sticky.getByTestId('removed-toggle')).toBeFocused();
    await expect(sticky.getByTestId('removed-toggle')).toHaveAttribute('aria-expanded', 'true');
    await sticky.getByTestId('regen-dismiss').click();
    await expect(banner).toHaveCount(0);
    await expect(sticky.getByTestId('kr-new-tag')).toHaveCount(0);

    // Selection mode: pick the second one only
    const after = await keyResultIds(sticky);
    await mockServer.setResponses({
      ...mockFor('提高团队效率'),
      regenerate: draftOf([
        {
          id: after.ids[1]!,
          statement: '每两周至少两次结对编程',
          target: '2次',
          measurement: '每两周',
        },
        { id: after.ids[0]!, statement: '不应该改', target: '1', measurement: 'x' },
        { id: 'outside-1', statement: '也不应该加', target: '1', measurement: 'x' },
      ]),
    } as never);
    await button.click();
    await sticky.getByTestId('regenerate-button-option-0').click();
    await expect(sticky.getByTestId('regen-select-bar')).toBeVisible();
    await expect(sticky.getByTestId('regen-select-confirm')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await sticky.getByTestId('kr-select').nth(1).check();
    await expect(sticky.getByTestId('regen-selected-count')).toHaveText('已选 1 条');
    await shot(sticky, 'D3-07-regenerate-selection');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D3-08-regenerate-selection-dark');
    await setTheme(sticky, 'light');
    await sticky.getByTestId('regen-select-confirm').click();
    await expect(dialog).toContainText('重新生成所选的 1 条关键结果？');
    await sticky.getByTestId('dialog-confirm').click();
    await expect(banner).toContainText('已重新生成所选的 1 条关键结果', { timeout: 20_000 });
    const partial = await statements(sticky);
    expect(partial[0]).toBe('代码评审在一天内完成');
    expect(partial[1]).toContain('每两周至少两次结对编程');

    // Failure: the model errors → red alert banner, list unchanged
    await mockServer.setResponses({
      ...mockFor('提高团队效率'),
      error: { status: 500, message: 'down' },
    } as never);
    await button.click();
    await sticky.getByTestId('regenerate-button-option-1').click();
    await sticky.getByTestId('dialog-confirm').click();
    const failed = sticky.getByTestId('regen-failed');
    await expect(failed).toBeVisible({ timeout: 60_000 });
    await expect(failed).toHaveAttribute('role', 'alert');
    await expect(failed).toContainText('重新生成失败，原来的关键结果没有改动。');
    expect(await statements(sticky)).toEqual(partial);
    await shot(sticky, 'D3-09-regenerate-failed');
    await axe(sticky, 'regenerate failed');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D3-10-regenerate-failed-dark');
    await setTheme(sticky, 'light');
    await sticky.getByTestId('regen-dismiss').click();

    // Running: the main process holds the request → skeletons, busy, button disabled
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('clarityokr:okr:regenerate-krs');
      ipcMain.handle('clarityokr:okr:regenerate-krs', () => new Promise(() => undefined));
    });
    await button.click();
    await sticky.getByTestId('regenerate-button-option-1').click();
    await sticky.getByTestId('dialog-confirm').click();
    await expect(sticky.getByTestId('kr-skeleton')).toHaveCount(3);
    await expect(sticky.getByTestId('regen-progress')).toHaveCount(1);
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(sticky.locator('.regen-live')).toHaveText('正在重新生成关键结果…');
    await shot(sticky, 'D3-11-regenerate-running');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D3-12-regenerate-running-dark');
    await setTheme(sticky, 'light');
  });
});

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

test.describe('D3: N15 — no tray icon (Windows / Linux)', () => {
  test('「隐藏」 on the last visible window: the tooltip says so and it quits', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await stubQuit(electronApp);
    await electronApp.evaluate(() =>
      (
        globalThis as unknown as { __clarityokrE2E: { dropTray: () => void } }
      ).__clarityokrE2E.dropTray(),
    );
    const tooltip = sticky.getByTestId('hide-tooltip');
    // the main window is still visible: hiding is a normal hide
    await sticky.getByTestId('hide-button').hover();
    await expect(tooltip).toHaveText('隐藏便签（应用仍在运行，不是退出）');
    // hide the main window: now the sticky note is the last visible window
    await electronApp.evaluate(({ BrowserWindow }, title) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() !== title)
        ?.hide();
    }, STICKY_TITLE);
    await sticky.mouse.move(5, 200);
    await sticky.getByTestId('hide-button').hover();
    await expect(tooltip).toHaveText('退出 ClarityOKR（没有托盘图标，隐藏后无法唤回）');
    await expect(tooltip).toBeVisible();
    await expect(sticky.getByTestId('hide-button')).toHaveAttribute('aria-label', '隐藏便签');
    await shot(sticky, 'D3-13-hide-tooltip-no-tray');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D3-14-hide-tooltip-no-tray-dark');
    await setTheme(sticky, 'light');
    // nothing unsaved → quits at once, the window was not hidden
    await sticky.getByTestId('hide-button').click();
    await expect.poll(() => quitCalls(electronApp)).toBe(1);
    const visible = await electronApp.evaluate(
      ({ BrowserWindow }, title) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.getTitle() === title)
          ?.isVisible(),
      STICKY_TITLE,
    );
    expect(visible).toBe(true);
  });

  test('… with an unsaved review the quit confirmation comes up instead', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await stubQuit(electronApp);
    await electronApp.evaluate(() =>
      (
        globalThis as unknown as { __clarityokrE2E: { dropTray: () => void } }
      ).__clarityokrE2E.dropTray(),
    );
    await sticky.getByTestId('tab-review').click();
    await sticky.getByTestId('review-wentWell').fill('还没保存的复盘');
    await electronApp.evaluate(({ BrowserWindow }, title) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() !== title)
        ?.hide();
    }, STICKY_TITLE);
    // closing the window (the same rule as 「隐藏」)
    await electronApp.evaluate(({ BrowserWindow }, title) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() === title)
        ?.close();
    }, STICKY_TITLE);
    await expect(sticky.getByTestId('quit-dialog')).toBeVisible();
    expect(await quitCalls(electronApp)).toBe(0);
  });
});
