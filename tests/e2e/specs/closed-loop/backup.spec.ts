import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type NodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';

import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { axe, invoke, openSticky, setTheme, shot } from '../../helpers/closed-loop';

/**
 * #50 full backup (spec S1§9) against the real main process and SQLite: 「⋯」→「全部备份…」, the
 * toasts, the backup import preview (duplicates, Q9-2 / Q9-5), the errors, and a round trip into
 * an emptied database (AC1).
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

/** Empties the database the app runs on (the E2E database of this test). */
async function clearDatabase(electronApp: ElectronApplication): Promise<void> {
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
}

test.describe('#50 full backup', () => {
  let dir: string;
  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'okr-backup-e2e-'));
  });
  test.afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('back up → preview / duplicates / errors → round trip into an empty database', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    test.setTimeout(180_000);
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    const backupPath = join(dir, 'backup.json');

    // 「⋯」 → 「全部备份…」
    await stubDialogs(electronApp, backupPath, null);
    await sticky.getByTestId('more-button').click();
    const item = sticky.getByTestId('backup-item');
    await expect(item).toBeFocused();
    await expect(item).toContainText('全部备份…');
    await both(sticky, 'S1-20-backup-menu');
    await axe(sticky, 'more menu with backup');
    await item.press('Enter');
    const success = sticky.getByTestId('toast-success');
    await expect(success).toContainText('已备份 1 个 OKR：');
    await expect(success).toContainText('备份不含 API key，恢复后需要重新填写。');
    await expect(success).toHaveAttribute('role', 'status');
    await both(sticky, 'S1-21-backup-saved');

    const file = JSON.parse(readFileSync(backupPath, 'utf8'));
    expect(file).toMatchObject({ schemaVersion: 1, kind: 'backup' });
    expect(file.okrs).toHaveLength(1);
    expect(readFileSync(backupPath, 'utf8')).not.toMatch(/apiKey|api_key|secret/i);
    const okr = file.okrs[0];
    const variant = (title: string, createdAt: string) => ({
      ...structuredClone(okr),
      objective: { ...okr.objective, title, createdAt },
    });
    const write = (name: string, content: unknown): string => {
      const path = join(dir, `${name}.json`);
      writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
      return path;
    };

    await sticky.getByTestId('tab-history').click();
    const button = sticky.getByTestId('history-import');

    // preview without duplicates
    await stubDialogs(
      electronApp,
      null,
      write('fresh', { ...file, okrs: [variant('新的一个', '2026-01-01T00:00:00.000Z')] }),
    );
    await button.click();
    const preview = sticky.getByTestId('import-dialog-backup');
    await expect(preview).toHaveAttribute('role', 'alertdialog');
    await expect(preview).toContainText('导入备份？');
    await expect(preview).toContainText('1 个都是新的，会全部导入。');
    await expect(preview.getByRole('button', { name: '取消' })).toBeFocused();
    await expect(preview.getByRole('button', { name: '导入 1 个' })).toBeVisible();
    await both(sticky, 'S1-24-backup-preview');
    await axe(sticky, 'backup preview');
    await sticky.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);

    // all duplicates → 「开始导入」 disabled
    await stubDialogs(electronApp, null, backupPath);
    await button.click();
    await expect(preview.getByTestId('dialog-confirm')).toHaveAttribute('aria-disabled', 'true');
    await expect(preview).toContainText('所有项都选了跳过，没有要导入的内容。');
    await both(sticky, 'S1-26-backup-all-skipped');
    await preview.getByRole('button', { name: '取消' }).click();

    // duplicates with the history and inside the file (Q9-5), default skip (Q9-2)
    const other = variant('第二个目标', '2026-02-01T00:00:00.000Z');
    await stubDialogs(electronApp, null, write('mixed', { ...file, okrs: [okr, other, other] }));
    await button.click();
    await expect(preview).toContainText('其中 2 个和历史里已有的 OKR 同名且创建时间相同：');
    await expect(preview.getByTestId('backup-duplicates')).toContainText('文件内重复');
    await expect(preview.getByTestId('dialog-note')).toHaveText('将导入 1 个，跳过 2 个。');
    await preview.getByTestId('backup-row-0').getByRole('radio', { name: '作为副本' }).click();
    await expect(preview.getByTestId('dialog-note')).toHaveText('将导入 2 个，跳过 1 个。');
    await both(sticky, 'S1-25-backup-duplicates');
    await axe(sticky, 'backup duplicates');
    await preview.getByRole('button', { name: '开始导入' }).click();
    await expect(sticky.getByTestId('toast-success')).toContainText('导入 2 个，跳过 1 个。');
    await expect(sticky.getByTestId('history-new-tag')).toHaveCount(2);
    await both(sticky, 'S1-29-backup-imported');
    const titles = (await invoke(sticky, 'clarityokr:okr:list')).data.items.map(
      (i: { title: string }) => i.title,
    );
    expect(titles.sort()).toEqual(
      [okr.objective.title, `${okr.objective.title}（导入）`, '第二个目标'].sort(),
    );

    // empty backup
    await stubDialogs(electronApp, null, write('empty', { ...file, okrs: [] }));
    await button.click();
    const error = sticky.getByTestId('import-dialog-error');
    // #85: information, not an error: role=dialog, no ⚠, title in the primary text colour
    await expect(error.locator('.dialog__title')).toHaveText('备份里没有 OKR');
    await expect(error).toContainText('这个备份里一个 OKR 也没有，没有可导入的内容。');
    await expect(error).toContainText('数据没有任何改动。');
    await expect(sticky.getByRole('alertdialog')).toHaveCount(0);
    await expect(sticky.getByRole('dialog', { name: '备份里没有 OKR' })).toBeVisible();
    await expect(error.locator('.dialog__title')).not.toHaveClass(/dialog__title--error/);
    await both(sticky, 'S1-27-backup-empty-plain');
    await error.getByRole('button', { name: '知道了' }).click();

    // one bad OKR refuses the whole file (AC4)
    const bad = [okr, other, other, structuredClone(okr)].map((o) => structuredClone(o));
    bad[3].keyResults[0].status = 'blocked';
    await stubDialogs(electronApp, null, write('bad', { ...file, okrs: bad }));
    await button.click();
    await expect(error).toContainText('备份里第 4 个 OKR 有误，整份没有导入。');
    // #69: a plain-language place, never the English path.
    const detail = error.getByTestId('dialog-detail');
    await expect(detail).toContainText('第 4 个 OKR 的第 1 个关键结果的状态不是可选的状态');
    await expect(detail).not.toContainText('okrs[');
    await both(sticky, 'S1-28-backup-invalid');
    await error.getByRole('button', { name: '知道了' }).click();

    // round trip (AC1): empty the database, back up the empty history, import the first backup
    await clearDatabase(electronApp);
    const emptyPath = join(dir, 'empty-backup.json');
    await stubDialogs(electronApp, emptyPath, null);
    await sticky.getByTestId('more-button').click();
    await sticky.getByTestId('backup-item').click();
    await expect(sticky.getByTestId('toast-success')).toContainText('（目前没有 OKR）');
    await both(sticky, 'S1-22-backup-empty-saved');
    expect(JSON.parse(readFileSync(emptyPath, 'utf8')).okrs).toEqual([]);

    await stubDialogs(electronApp, null, backupPath);
    await button.click();
    await preview.getByRole('button', { name: '导入 1 个' }).click();
    await expect(sticky.getByTestId('toast-success')).toContainText('已导入 1 个 OKR。');
    const list = (await invoke(sticky, 'clarityokr:okr:list')).data.items;
    expect(list).toHaveLength(1);
    const again = join(dir, 'again.json');
    await stubDialogs(electronApp, again, null);
    await sticky.evaluate(() =>
      (
        window as unknown as { clarifyOkr: { invoke: (c: string) => Promise<unknown> } }
      ).clarifyOkr.invoke('clarityokr:export:backup'),
    );
    const restored = JSON.parse(readFileSync(again, 'utf8')).okrs[0];
    expect(restored.objective).toEqual(okr.objective);
    expect(restored.keyResults.map((k: { statement: string }) => k.statement)).toEqual(
      okr.keyResults.map((k: { statement: string }) => k.statement),
    );
    expect(restored.progressEntries).toHaveLength(okr.progressEntries.length);
  });
});
