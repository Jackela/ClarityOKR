import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type NodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';

import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { axe, invoke, openSticky, setTheme, shot } from '../../helpers/closed-loop';

/**
 * #49 import (spec S1§8 + v3.1) against the real main process and SQLite: export → import
 * (conflict → copy) → same content, the error dialogs, the retry path and the screenshots.
 */

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

async function stubDialogs(
  electronApp: ElectronApplication,
  save: string | null,
  open: string | null,
): Promise<void> {
  await electronApp.evaluate(
    ({ dialog }, [savePath, openPath]) => {
      const d = dialog as unknown as Record<string, unknown>;
      d.showSaveDialog = async () =>
        savePath ? { canceled: false, filePath: savePath } : { canceled: true, filePath: '' };
      d.showOpenDialog = async () =>
        openPath ? { canceled: false, filePaths: [openPath] } : { canceled: true, filePaths: [] };
    },
    [save, open] as const,
  );
}

async function both(page: Page, name: string): Promise<void> {
  await shot(page, `${name}-light`);
  await setTheme(page, 'dark');
  await shot(page, `${name}-dark`);
  await setTheme(page, 'light');
}

test.describe('#49 import', () => {
  let dir: string;
  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'okr-import-e2e-'));
  });
  test.afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('export → import as copy → same content; cancel, conflict, errors, 新导入', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    test.setTimeout(120_000);
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    const jsonPath = join(dir, 'okr.json');

    // export the OKR as JSON
    await stubDialogs(electronApp, jsonPath, null);
    await sticky.getByTestId('export-button').click();
    await sticky.getByTestId('export-json').click();
    await expect(sticky.getByTestId('toast-success')).toBeVisible();
    const exported = JSON.parse(readFileSync(jsonPath, 'utf8'));

    await sticky.getByTestId('tab-history').click();
    const button = sticky.getByTestId('history-import');
    await expect(button).toHaveText('导入…');
    await both(sticky, 'S1-01-history-import');
    await axe(sticky, 'history with import');

    // cancel
    await button.click();
    await expect(sticky.getByTestId('toast-neutral')).toContainText('已取消导入，没有改动数据。');
    await both(sticky, 'S1-04-import-cancelled');

    // the same file again: conflict dialog, focus on 取消
    await stubDialogs(electronApp, null, jsonPath);
    await button.click();
    const conflict = sticky.getByTestId('import-dialog-conflict');
    await expect(conflict).toBeVisible();
    await expect(conflict).toHaveAttribute('role', 'alertdialog');
    await expect(conflict.getByRole('button', { name: '取消' })).toBeFocused();
    await expect(conflict).toContainText('这个 OKR 已经存在');
    // #68: the cancel toast of the previous step is gone, nothing lingers behind the dialog
    await expect(sticky.getByTestId('toast-neutral')).toHaveCount(0);
    await both(sticky, 'S1-05-import-conflict');
    await axe(sticky, 'import conflict dialog');
    // skip → nothing written
    await conflict.getByRole('button', { name: '跳过' }).click();
    await expect(sticky.getByTestId('toast-neutral')).toContainText('已跳过「提高团队效率」');
    await both(sticky, 'S1-06-import-skipped');

    // copy → a new OKR 「提高团队效率（导入）」 with the same content
    await button.click();
    await sticky
      .getByTestId('import-dialog-conflict')
      .getByRole('button', { name: '作为副本导入' })
      .click();
    const success = sticky.getByTestId('toast-success');
    await expect(success).toContainText('已导入 1 个 OKR');
    await expect(sticky.getByTestId('history-new-tag')).toHaveCount(1);
    await success.getByTestId('import-view').click();
    await expect(sticky.locator('[role="option"]:focus')).toContainText('提高团队效率（导入）');
    await both(sticky, 'S1-07-import-success');

    const list = await invoke(sticky, 'clarityokr:okr:list');
    const copy = list.data.items.find((i: { title: string }) => i.title === '提高团队效率（导入）');
    expect(copy).toBeTruthy();
    const copyPath = join(dir, 'copy.json');
    await stubDialogs(electronApp, copyPath, null);
    await sticky.evaluate(
      ([okrId]) =>
        (
          window as unknown as {
            clarifyOkr: { invoke: (c: string, p: unknown) => Promise<unknown> };
          }
        ).clarifyOkr.invoke('clarityokr:export:save', { okrId, format: 'json' }),
      [copy.id] as const,
    );
    const again = JSON.parse(readFileSync(copyPath, 'utf8'));
    expect(again.objective).toEqual({
      ...exported.objective,
      title: '提高团队效率（导入）',
      pinned: false,
    });
    expect(again.keyResults.map((k: { statement: string }) => k.statement)).toEqual(
      exported.keyResults.map((k: { statement: string }) => k.statement),
    );

    // errors
    const errorCase = async (name: string, content: string | Buffer, title: string) => {
      const path = join(dir, `${name}.json`);
      writeFileSync(path, content);
      await stubDialogs(electronApp, null, path);
      await button.click();
      const dialog = sticky.getByTestId('import-dialog-error');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(title);
      await expect(dialog).toContainText('数据没有任何改动。');
      await expect(dialog.getByRole('button', { name: '知道了' })).toBeFocused();
      await expect(sticky.locator('[data-testid^="toast-"]')).toHaveCount(0); // #68
      await both(sticky, name);
      await sticky.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    };
    await errorCase('S1-08-import-too-large', Buffer.alloc(5 * 1024 * 1024 + 10, 0x20), '文件太大');
    await errorCase('S1-09-import-not-json', '{ nope', '这不是可以导入的文件');
    const bad = structuredClone(exported);
    bad.keyResults[0].progress = 150;
    bad.keyResults[1].status = 'blocked';
    await errorCase('S1-10-import-invalid', JSON.stringify(bad), '文件内容有误');
    // #69: no English keys, paths or codes in the dialog (B13)
    const plainDetail = async (name: string, content: string, first: string, last?: string) => {
      const path = join(dir, `${name}.json`);
      writeFileSync(path, content);
      await stubDialogs(electronApp, null, path);
      await button.click();
      const dialog = sticky.getByTestId('import-dialog-error');
      await expect(dialog).toBeVisible();
      const detail = dialog.getByTestId('dialog-detail');
      await expect(detail).toContainText(first);
      if (last) await expect(detail).toContainText(last);
      const text = (await dialog.innerText()).replace(/OKR|KR|ClarityOKR|Q\d/g, '');
      expect(text).not.toMatch(/[A-Za-z]{2,}/);
      expect(text).not.toMatch(/\[\d+\]/);
      await expect(detail).toHaveCSS('font-size', '13px');
      await expect(detail).toHaveCSS('line-height', '20px');
      await both(sticky, name);
      await sticky.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    };
    await plainDetail(
      'S1-10-import-invalid-plain',
      JSON.stringify(bad),
      '第 1 个关键结果的进度超出 0 到 100',
    );
    await plainDetail(
      'S1-10b-import-backup-nested',
      JSON.stringify({
        schemaVersion: 1,
        kind: 'backup',
        exportedAt: exported.exportedAt,
        appVersion: '0.3.0',
        okrs: [exported, exported, exported, bad],
      }),
      '第 4 个 OKR 的第 1 个关键结果的进度超出 0 到 100',
    );
    const many = structuredClone(exported);
    many.progressEntries = Array.from({ length: 110 }, (_, i) => ({
      id: i + 1,
      krId: exported.keyResults[0].id,
      kind: 'set',
      value: 10,
      status: 'blocked',
      revertsEntryId: null,
      recordedAt: exported.exportedAt,
    }));
    await plainDetail(
      'S1-10c-import-invalid-99plus',
      JSON.stringify(many),
      '第 1 条进度记录的状态不是可选的状态',
      '另有 99+ 处',
    );
    await errorCase(
      'S1-11-import-version',
      JSON.stringify({ ...exported, schemaVersion: 2 }),
      '版本不受支持',
    );
    await axe(sticky, 'import error dialog');

    // a file that disappears between the dialog and the read
    const gone = join(dir, 'gone.json');
    await stubDialogs(electronApp, null, gone);
    await button.click();
    await expect(sticky.getByTestId('import-dialog-error')).toContainText('文件不存在或已被移动。');
    await both(sticky, 'S1-12-import-read-failed');
    await sticky.keyboard.press('Escape');
  });

  test('S1-02: an empty history offers 「从文件导入…」', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    // Clear the database the app is running on (the E2E database of this test).
    await electronApp.evaluate(() => {
      const { createRequire } = process.getBuiltinModule('node:module') as typeof NodeModule;
      const require = createRequire(`${process.cwd()}/app/main/package.json`);
      const Database = require('better-sqlite3') as new (p: string) => {
        exec: (sql: string) => void;
        close: () => void;
      };
      const db = new Database(process.env.E2E_DB_PATH as string);
      db.exec('DELETE FROM objectives');
      db.close();
    });
    await sticky.getByTestId('tab-history').click();
    await expect(sticky.getByTestId('history-empty')).toBeVisible();
    await expect(sticky.getByTestId('history-import-empty')).toHaveText('从文件导入…');
    await both(sticky, 'S1-02-import-empty');
    await axe(sticky, 'empty history with import');
  });

  test('empty history and the locked / narrow entry', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await sticky.getByTestId('tab-history').click();
    await sticky.setViewportSize({ width: 340, height: 560 });
    await expect(sticky.getByTestId('history-import')).toBeVisible();
    await both(sticky, 'S1-14-import-narrow');
  });
});
