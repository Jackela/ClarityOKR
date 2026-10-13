/*
 * TODO(N5): the held review:save test below swaps the main-process handler through Electron's
 * PRIVATE `ipcMain._invokeHandlers` map (there is no public API to replace a handle()). If an
 * Electron upgrade renames it, that test fails loudly ("review:save is not registered"); replace
 * it then with a test-only hook in the main process (guarded by E2E_TEST) instead.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
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

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

/** Makes the main process answer the system save dialog with `paths` (in order), or cancel. */
async function stubSaveDialog(
  electronApp: ElectronApplication,
  answers: Array<string | null>,
): Promise<void> {
  await electronApp.evaluate(({ dialog }, queue) => {
    const pending = [...queue];
    (dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async () => {
      const next = pending.length > 0 ? pending.shift() : null;
      return next === null || next === undefined
        ? { canceled: true, filePath: '' }
        : { canceled: false, filePath: next };
    };
  }, answers);
}

/** Records what the main process was asked to reveal instead of opening a file manager. */
async function stubReveal(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ shell }) => {
    const calls: string[] = [];
    (globalThis as unknown as { __revealed: string[] }).__revealed = calls;
    (shell as unknown as { showItemInFolder: (p: string) => void }).showItemInFolder = (p) => {
      calls.push(p);
    };
  });
}

const revealed = (electronApp: ElectronApplication): Promise<string[]> =>
  electronApp.evaluate(() => (globalThis as unknown as { __revealed: string[] }).__revealed);

const menuItem = (sticky: Page, id: string) => sticky.getByTestId(id);

async function openMenu(sticky: Page): Promise<void> {
  await sticky.getByTestId('export-button').click();
  await expect(sticky.getByTestId('export-menu')).toBeVisible();
}

test.describe('closed loop: export UI (D1b-2)', () => {
  let dir: string;

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'okr-export-e2e-'));
  });
  test.afterEach(() => {
    try {
      chmodSync(join(dir, 'readonly'), 0o755);
    } catch {
      /* not created */
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test('top bar, menu keyboard, cancel, success (Markdown + JSON), reveal, copy path', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await stubReveal(electronApp);

    // top bar: a drag area; the export button is no-drag (spec §12.1 G3) and first in Tab order
    const regions = await sticky.evaluate(() => {
      const region = (el: Element | null): string =>
        el
          ? (getComputedStyle(el) as CSSStyleDeclaration & { webkitAppRegion: string })
              .webkitAppRegion
          : '';
      return {
        bar: region(document.querySelector('[data-testid="top-bar"]')),
        button: region(document.querySelector('[data-testid="export-button"]')),
        tabs: region(document.querySelector('[role="tablist"]')),
      };
    });
    expect(regions).toEqual({ bar: 'drag', button: 'no-drag', tabs: 'none' });
    await sticky.keyboard.press('Tab');
    await expect(sticky.getByTestId('export-button')).toBeFocused();
    await expect(sticky.getByTestId('export-button')).toHaveAttribute('aria-haspopup', 'menu');
    await expect(sticky.getByTestId('export-button')).toHaveAttribute('aria-expanded', 'false');
    await axe(sticky, 'top bar');

    // T9: Enter opens and focuses the first item; ↓ moves; Esc closes and returns to the button
    await sticky.keyboard.press('Enter');
    await expect(sticky.getByTestId('export-menu')).toBeVisible();
    await expect(menuItem(sticky, 'export-md')).toBeFocused();
    await sticky.keyboard.press('ArrowDown');
    await expect(menuItem(sticky, 'export-json')).toBeFocused();
    await sticky.keyboard.press('End');
    await expect(menuItem(sticky, 'export-copy-md')).toBeFocused();
    await shot(sticky, 'D1b-19-export-menu');
    await axe(sticky, 'export menu');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1b-20-export-menu-dark');
    await axe(sticky, 'export menu (dark)');
    await setTheme(sticky, 'light');
    await sticky.keyboard.press('Escape');
    await expect(sticky.getByTestId('export-menu')).toHaveCount(0);
    await expect(sticky.getByTestId('export-button')).toBeFocused();

    // cancel → neutral toast, no buttons, focus back on the button, nothing written
    await stubSaveDialog(electronApp, [null]);
    await openMenu(sticky);
    await menuItem(sticky, 'export-md').click();
    const neutral = sticky.getByTestId('toast-neutral');
    await expect(neutral).toContainText('已取消导出，没有保存文件。');
    await expect(neutral).toHaveAttribute('role', 'status');
    await expect(neutral.getByTestId('toast-reveal')).toHaveCount(0);
    await expect(sticky.getByTestId('export-button')).toBeFocused();
    expect(readdirSync(dir)).toEqual([]);
    await shot(sticky, 'D1b-21-export-cancelled');
    await axe(sticky, 'export cancelled toast');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1b-22-export-cancelled-dark');
    await axe(sticky, 'export cancelled toast (dark)');
    await setTheme(sticky, 'light');

    // success (Markdown): the file is the readable copy, the toast has name + path + 2 buttons
    const mdPath = join(dir, 'review.md');
    await stubSaveDialog(electronApp, [mdPath]);
    await openMenu(sticky);
    await menuItem(sticky, 'export-md').click();
    const success = sticky.getByTestId('toast-success');
    await expect(success).toContainText('已导出「提高团队效率」为 Markdown：review.md');
    await expect(success).toHaveAttribute('role', 'status');
    await expect(success.getByTestId('toast-detail')).toHaveAttribute('title', mdPath);
    await expect(success.getByTestId('toast-reveal')).toHaveText('在文件夹中显示');
    await expect(success.getByTestId('toast-copy-path')).toHaveText('复制路径');
    await expect(sticky.getByTestId('export-button')).toBeFocused();
    const markdown = readFileSync(mdPath, 'utf8');
    expect(markdown).toContain('# 提高团队效率');
    expect(markdown).toContain('## 关键结果');
    expect(markdown).toContain('代码评审缩短到两天内');
    await shot(sticky, 'D1b-23-export-saved');
    await axe(sticky, 'export saved toast');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1b-24-export-saved-dark');
    await axe(sticky, 'export saved toast (dark)');
    await setTheme(sticky, 'light');

    // 复制路径: the full path is on the clipboard; the button says so and the toast stays
    await success.getByTestId('toast-copy-path').click();
    await expect(success.getByTestId('toast-copy-path')).toHaveText('已复制');
    expect(await electronApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(mdPath);
    await expect(success).toBeVisible();

    // 在文件夹中显示: the main process is asked for exactly this path
    await success.getByTestId('toast-reveal').click();
    await expect.poll(() => revealed(electronApp)).toEqual([mdPath]);

    // JSON: schemaVersion 1; a new toast replaces the old one and only its path is revealable
    const jsonPath = join(dir, 'review.json');
    await stubSaveDialog(electronApp, [jsonPath]);
    await openMenu(sticky);
    await menuItem(sticky, 'export-json').click();
    await expect(sticky.getByTestId('toast-success')).toContainText(
      '已导出「提高团队效率」为 JSON：review.json',
    );
    await expect(sticky.getByTestId('toast-success')).toHaveCount(1);
    const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(json.schemaVersion).toBe(1);
    expect(json.keyResults).toHaveLength(3);
    expect(json.review).toBeNull();
    const stale = await sticky.evaluate(
      (path) =>
        (
          window as unknown as {
            clarifyOkr: { invoke: (c: string, p: unknown) => Promise<{ ok: boolean }> };
          }
        ).clarifyOkr.invoke('clarityokr:export:reveal', { path }),
      mdPath,
    );
    expect(stale.ok).toBe(false);

    // the word 「备份」 is nowhere (spec §12.1 G9)
    expect(await sticky.locator('body').innerText()).not.toContain('备份');
  });

  test('errors: exists (original untouched) → 重新选择位置 → saved; not found; permission; 关闭 returns focus', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);

    // exists: the dialog answer gets .md appended and collides with a file that is there
    writeFileSync(join(dir, 'taken.md'), 'precious');
    const freePath = join(dir, 'fresh.md');
    await stubSaveDialog(electronApp, [join(dir, 'taken'), freePath]);
    await openMenu(sticky);
    await menuItem(sticky, 'export-md').click();
    const alert = sticky.getByTestId('toast-error');
    await expect(alert).toContainText('同名文件已存在，请换个名字再导出。');
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert.getByTestId('toast-retry')).toHaveText('重新选择位置');
    await expect(alert.getByTestId('toast-close')).toHaveText('关闭');
    await expect(sticky.getByTestId('export-button')).toBeFocused(); // the toast never takes it
    expect(readFileSync(join(dir, 'taken.md'), 'utf8')).toBe('precious');
    const text = await alert.innerText();
    expect(text).not.toContain(dir);
    expect(text).not.toMatch(/EEXIST|exists\b/);
    // it does not go away by itself
    await sticky.waitForTimeout(100);
    await expect(alert).toBeVisible();
    await shot(sticky, 'D1b-25-export-exists');
    // D1c: the error toast carries a ⚠ icon before the text (not colour alone)
    await expect(alert.getByTestId('toast-error-icon')).toBeVisible();
    await shot(sticky, 'D1c-18-error-toast-icon');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1c-19-error-toast-icon-dark');
    await axe(sticky, 'error toast with icon (dark)');
    await setTheme(sticky, 'light');
    await axe(sticky, 'export exists error');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1b-26-export-exists-dark');
    await axe(sticky, 'export exists error (dark)');
    await setTheme(sticky, 'light');

    // 重新选择位置 → the dialog again → a free name → saved
    await alert.getByTestId('toast-retry').click();
    await expect(sticky.getByTestId('toast-success')).toContainText(
      '已导出「提高团队效率」为 Markdown：fresh.md',
    );
    expect(existsSync(freePath)).toBe(true);
    expect(readFileSync(join(dir, 'taken.md'), 'utf8')).toBe('precious');

    // not found (the folder is gone)
    await stubSaveDialog(electronApp, [join(dir, 'no-such-folder', 'x.md')]);
    await openMenu(sticky);
    await menuItem(sticky, 'export-md').click();
    await expect(sticky.getByTestId('toast-error')).toContainText(
      '保存位置不存在或暂时不可用，请换一个文件夹。',
    );
    await expect(sticky.getByTestId('toast-retry')).toHaveText('重新选择位置');

    // permission (a read-only folder)
    const readonly = join(dir, 'readonly');
    mkdirSync(readonly);
    chmodSync(readonly, 0o555);
    await stubSaveDialog(electronApp, [join(readonly, 'x.md')]);
    await openMenu(sticky);
    await menuItem(sticky, 'export-md').click();
    await expect(sticky.getByTestId('toast-error')).toContainText(
      '没有权限保存到这个位置，请换一个文件夹。',
    );
    expect(readdirSync(readonly)).toEqual([]);
    await shot(sticky, 'D1b-27-export-permission');

    // 关闭 removes it and the focus is back on the export button
    await sticky.getByTestId('toast-close').click();
    await expect(sticky.getByTestId('toast-error')).toHaveCount(0);
    await expect(sticky.getByTestId('export-button')).toBeFocused();
  });

  test('复制为 Markdown puts the .md text on the clipboard', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await openMenu(sticky);
    await menuItem(sticky, 'export-copy-md').click();
    await expect(sticky.getByTestId('toast-success')).toContainText('已复制到剪贴板。');
    const clip = await electronApp.evaluate(({ clipboard }) => clipboard.readText());
    expect(clip).toContain('# 提高团队效率');
    expect(clip).toContain('## 关键结果');
    expect(clip).not.toContain('## Objective');
    await axe(sticky, 'copied toast');
  });

  test('a review save that is still in flight: 「放弃修改」 is disabled with 正在保存，请稍候。, then the save decides', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    // Hold the main-process handler of clarityokr:review:save until the test lets it go.
    await electronApp.evaluate(({ ipcMain }) => {
      const handlers = (
        ipcMain as unknown as {
          _invokeHandlers: Map<string, (event: unknown, payload: unknown) => Promise<unknown>>;
        }
      )._invokeHandlers;
      const original = handlers.get('clarityokr:review:save');
      if (!original) throw new Error('review:save is not registered');
      const state = globalThis as unknown as {
        __holdSave: { waiting: boolean; release: (mode: 'ok' | 'fail') => void };
      };
      handlers.set('clarityokr:review:save', async (event, payload) => {
        const mode = await new Promise<'ok' | 'fail'>((resolve) => {
          state.__holdSave = { waiting: true, release: resolve };
        });
        state.__holdSave.waiting = false;
        if (mode === 'fail') {
          return { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong' } };
        }
        return original(event, payload);
      });
    });
    const waiting = (): Promise<boolean> =>
      electronApp.evaluate(
        () =>
          (globalThis as unknown as { __holdSave?: { waiting: boolean } }).__holdSave?.waiting ===
          true,
      );
    const release = (mode: 'ok' | 'fail'): Promise<void> =>
      electronApp.evaluate((_, m) => {
        (
          globalThis as unknown as { __holdSave: { release: (v: string) => void } }
        ).__holdSave.release(m);
      }, mode);

    await sticky.getByTestId('tab-review').click();
    const wentWell = sticky.getByTestId('review-wentWell');
    await wentWell.fill('保存途中要离开');
    await sticky.getByTestId('review-save').click();
    await expect.poll(waiting).toBe(true);
    await expect(sticky.getByTestId('review-save')).toBeDisabled();

    // the leave dialog while the save is held
    await sticky.getByTestId('tab-history').click();
    const dialog = sticky.getByTestId('review-leave-dialog');
    await expect(dialog).toBeVisible();
    const confirm = sticky.getByTestId('dialog-confirm');
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await expect(sticky.getByTestId('dialog-note')).toHaveText('正在保存，请稍候。');
    await expect(sticky.getByTestId('dialog-cancel')).toBeFocused();
    await expectDialogCentred(sticky, 'review-leave-dialog');
    await shot(sticky, 'D1b-17-leave-confirm-saving');
    await axe(sticky, 'leave confirm while saving');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1b-18-leave-confirm-saving-dark');
    await axe(sticky, 'leave confirm while saving (dark)');
    await setTheme(sticky, 'light');

    // clicking it does nothing; global shortcuts do nothing; the click on the scrim and Esc work
    // (aria-disabled counts as not actionable for Playwright, so force the click)
    await confirm.click({ force: true });
    await expect(dialog).toBeVisible();
    await sticky.keyboard.press('Control+3');
    await sticky.keyboard.press('Control+2');
    await sticky.keyboard.press('Control+s');
    await expect(dialog).toBeVisible();
    await expect(sticky.getByTestId('tab-review')).toHaveAttribute('aria-selected', 'true');
    await sticky.getByTestId('dialog-scrim').click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeVisible();
    await expectInert(sticky, 'review-save');

    // the save fails: 「放弃修改」 is clickable again, the text is still there
    await release('fail');
    await expect(confirm).not.toHaveAttribute('aria-disabled', 'true');
    await expect(sticky.getByTestId('dialog-note')).toHaveCount(0);
    await expect(dialog).toBeVisible();

    // keep editing (Esc), save again, leave while it is held, and let it succeed:
    // the dialog closes by itself and the leave goes on; the text IS saved
    await sticky.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(wentWell).toHaveValue('保存途中要离开');
    await sticky.getByTestId('review-save').click();
    await expect.poll(waiting).toBe(true);
    await sticky.getByTestId('tab-history').click();
    await expect(sticky.getByTestId('dialog-note')).toHaveText('正在保存，请稍候。');
    await release('ok');
    await expect(dialog).toHaveCount(0);
    await expect(sticky.getByTestId('tab-history')).toHaveAttribute('aria-selected', 'true');
    await sticky.getByTestId('tab-review').click();
    await expect(sticky.getByTestId('review-wentWell')).toHaveValue('保存途中要离开');
    await expect(sticky.getByTestId('review-save')).toBeDisabled();
  });
});
