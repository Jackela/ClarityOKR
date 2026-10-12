import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import type { MockResponseConfig } from '@clarityokr/contracts';

import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage, waitForStickyWindow } from '../../page-objects';
import { forceClick, waitForElement } from '../../helpers/native-dom';
import { runAxe } from '../../helpers/axe';

interface NodeModuleApi {
  createRequire: (path: string) => (id: string) => unknown;
}

interface SqliteLike {
  prepare: (sql: string) => { run: (...args: unknown[]) => { changes: number } };
  close: () => void;
}

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

const SHOTS_DIR = process.env.IMPL_SHOTS_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS_DIR) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
  await page.screenshot({ path: join(SHOTS_DIR, `${name}.png`) });
}

async function axe(page: Page, name: string): Promise<void> {
  const violations = await runAxe(page);
  expect(violations, `${name}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

/** The confirm dialog: centred, ≥24px from the top, both buttons fully inside the window. */
async function expectDialogCentred(page: Page, testId: string): Promise<void> {
  const geometry = await page.evaluate((id) => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const dialog = document.querySelector(`[data-testid="${id}"]`);
    return {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      dialog: rect(dialog),
      cancel: rect(dialog?.querySelector('[data-testid="dialog-cancel"]') ?? null),
      confirm: rect(dialog?.querySelector('[data-testid="dialog-confirm"]') ?? null),
    };
  }, testId);
  const { width, height, dialog, cancel, confirm } = geometry;
  expect(dialog).not.toBeNull();
  for (const box of [dialog!, cancel!, confirm!]) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(width);
    expect(box.bottom).toBeLessThanOrEqual(height);
  }
  expect(dialog!.top).toBeGreaterThanOrEqual(24);
  expect(height - dialog!.bottom).toBeGreaterThanOrEqual(24);
  expect(Math.abs((dialog!.left + dialog!.right) / 2 - width / 2)).toBeLessThanOrEqual(2);
  expect(Math.abs((dialog!.top + dialog!.bottom) / 2 - height / 2)).toBeLessThanOrEqual(2);
}

/** The element is behind a modal: it, or an ancestor, is `inert`. */
async function expectInert(page: Page, testId: string): Promise<void> {
  const inert = await page.evaluate(
    (id) => document.querySelector(`[data-testid="${id}"]`)?.closest('[inert]') !== null,
    testId,
  );
  expect(inert, `${testId} is inert behind the dialog`).toBe(true);
}

const setTheme = (page: Page, theme: 'light' | 'dark'): Promise<void> =>
  page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);

const mockFor = (title: string): MockResponseConfig => ({
  nextQuestion: (callNumber) =>
    callNumber <= 2
      ? {
          question: {
            id: `q${callNumber + 1}`,
            text: '请选择下一步',
            options: [
              { id: 'a', label: 'A', value: 'a' },
              { id: 'b', label: 'B', value: 'b' },
            ],
          },
        }
      : null,
  draft: {
    draft: {
      objectives: [
        {
          id: 'o1',
          title,
          description: '自动生成',
          keyResults: [
            { id: 'kr1', statement: '代码评审缩短到两天内', target: '2天', measurement: '耗时' },
            { id: 'kr2', statement: '测试覆盖率提升到 80%', target: '80%', measurement: '覆盖率' },
            { id: 'kr3', statement: '发布频率提升到每周两次', target: '2次', measurement: '次数' },
          ],
        },
      ],
    },
  },
});

async function openSticky(
  electronApp: Parameters<typeof waitForStickyWindow>[0],
  mainWindow: Page,
  mockServer: { setResponses: (c: MockResponseConfig) => Promise<void> },
): Promise<Page> {
  const clarification = new ClarificationPage(mainWindow);
  await mockServer.setResponses(mockFor('提高团队效率'));
  await clarification.waitForReady();
  await clarification.completeClarificationFlow('提高团队效率', {
    questionCount: 2,
    selectOptionIndex: 0,
    finalOptionIndex: 1,
  });
  await clarification.waitForOkrSummary(30000);
  await waitForElement(mainWindow, '[data-testid="sticky-reopen"]', { timeout: 10000 });
  await forceClick(mainWindow, '[data-testid="sticky-reopen"]');
  const sticky = await waitForStickyWindow(electronApp);
  await sticky.getByTestId('sticky-objective').waitFor({ state: 'visible' });
  await sticky.getByTestId('kr-list').waitFor({ state: 'visible' });
  return sticky;
}

const invoke = (page: Page, channel: string, payload?: unknown): Promise<any> =>
  page.evaluate(
    ([c, p]) =>
      (
        window as unknown as { clarifyOkr: { invoke: (c: string, p: unknown) => Promise<unknown> } }
      ).clarifyOkr.invoke(c as string, p),
    [channel, payload] as const,
  );

test.describe('closed loop: review tab and text edit (D1b-1)', () => {
  test('review: empty → limit error → leave confirm → save → persisted, with axe in both themes', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);

    // Ctrl+2 opens the review tab (Ctrl/⌘+2 is the spec shortcut)
    await sticky.keyboard.press('Control+2');
    await expect(sticky.getByTestId('tab-review')).toHaveAttribute('aria-selected', 'true');
    await expect(sticky.getByTestId('review-state')).toHaveText('还没有复盘');
    await expect(sticky.getByTestId('review-row')).toHaveCount(3);
    await expect(sticky.getByTestId('review-save')).toBeDisabled();
    await shot(sticky, 'D1b-01-review-empty');
    await axe(sticky, 'review empty');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1b-02-review-empty-dark');
    await axe(sticky, 'review empty (dark)');
    await setTheme(sticky, 'light');

    // over the limit: the text stays, a counter, an error row and a disabled save
    const wentWell = sticky.getByTestId('review-wentWell');
    await wentWell.fill('字'.repeat(2036));
    await expect(sticky.getByTestId('review-wentWell-count')).toContainText('2036/2000');
    await expect(sticky.getByTestId('review-wentWell-error')).toContainText(
      '超出 36 个字符，请删减后再保存。',
    );
    await expect(sticky.getByTestId('review-save')).toBeDisabled();
    await expect(sticky.getByTestId('review-state')).toHaveText('有未保存的修改');
    await sticky.getByTestId('review-wentWell-error').scrollIntoViewIfNeeded();
    await shot(sticky, 'D1b-03-review-limit-error');
    await axe(sticky, 'review over the limit');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1b-04-review-limit-error-dark');
    await axe(sticky, 'review over the limit (dark)');
    await setTheme(sticky, 'light');

    // the emoji counts as one character
    await wentWell.fill('👨‍👩‍👧‍👦'.repeat(10));
    await expect(sticky.getByTestId('review-wentWell-count')).toContainText('10/2000');
    await wentWell.fill('发布流程更稳了');

    // leaving with unsaved text asks first; 继续编辑 keeps the text and the tab
    await sticky.keyboard.press('Control+1');
    const dialog = sticky.getByTestId('review-leave-dialog');
    await expect(dialog).toBeVisible();
    await expect(sticky.getByTestId('dialog-cancel')).toBeFocused();
    await expectDialogCentred(sticky, 'review-leave-dialog');
    // a click on the scrim does nothing, keeps the focus in the dialog, Esc still works, and
    // the shell behind it is inert
    await sticky.getByTestId('dialog-scrim').click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeVisible();
    await expect(sticky.getByTestId('dialog-cancel')).toBeFocused();
    await expectInert(sticky, 'tab-review');
    await shot(sticky, 'D1b-05-review-leave-confirm');
    await axe(sticky, 'review leave confirm');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1b-06-review-leave-confirm-dark');
    await axe(sticky, 'review leave confirm (dark)');
    await setTheme(sticky, 'light');
    await sticky.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(sticky.getByTestId('tab-review')).toHaveAttribute('aria-selected', 'true');
    await expect(wentWell).toHaveValue('发布流程更稳了');
    await expect(wentWell).toBeFocused();

    // save with Ctrl+S: toast, status row, snapshot tag; the snapshot is frozen
    await sticky.getByTestId('review-nextSteps').fill('下周先把评审流程文档化');
    await sticky.keyboard.press('Control+s');
    await expect(sticky.getByTestId('toast-success')).toContainText('复盘已保存。');
    await expect(sticky.getByTestId('review-state')).toContainText('已保存 · ');
    await expect(sticky.getByTestId('review-snapshot-tag')).toContainText('快照 · ');
    await expect(sticky.getByTestId('review-snapshot-note')).toBeVisible();
    await shot(sticky, 'D1b-07-review-saved');
    await axe(sticky, 'review saved + toast');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1b-08-review-saved-dark');
    await axe(sticky, 'review saved + toast (dark)');
    await setTheme(sticky, 'light');

    // really persisted (real IPC): leave without a prompt (nothing unsaved) and read it back
    await sticky.getByTestId('tab-history').click();
    await expect(sticky.getByTestId('review-leave-dialog')).toHaveCount(0);
    await sticky.getByTestId('tab-review').click();
    await expect(sticky.getByTestId('review-wentWell')).toHaveValue('发布流程更稳了');
    await expect(sticky.getByTestId('review-nextSteps')).toHaveValue('下周先把评审流程文档化');
    await expect(sticky.getByTestId('review-save')).toBeDisabled();

    // 放弃修改 path: type, leave, confirm → the typed text is gone
    await sticky.getByTestId('review-fellShort').fill('临时写的');
    await sticky.getByTestId('tab-note').click();
    await sticky.getByTestId('dialog-confirm').click();
    await expect(sticky.getByTestId('tab-note')).toHaveAttribute('aria-selected', 'true');
    await sticky.keyboard.press('Control+2');
    await expect(sticky.getByTestId('review-fellShort')).toHaveValue('');
  });

  test('text edit: undo/redo, metric edit, 添加度量, add KR, discard confirm, save', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    await sticky.getByTestId('edit-button').click();
    const objective = sticky.getByTestId('edit-objective');
    await expect(objective).toBeFocused();
    await expect(sticky.getByTestId('edit-objective-count')).toContainText('/200');
    await shot(sticky, 'D1b-09-text-edit');
    await axe(sticky, 'text edit');
    await setTheme(sticky, 'dark');
    await shot(sticky, 'D1b-10-text-edit-dark');
    await axe(sticky, 'text edit (dark)');
    await setTheme(sticky, 'light');

    // undo / redo with the keyboard and the buttons
    await expect(sticky.getByTestId('edit-undo')).toBeDisabled();
    await objective.fill('第一版目标');
    // leaving the box (blur) ends the undo step, so the next typing is a step of its own
    await sticky.getByTestId('edit-metric-0').focus();
    await objective.fill('第二版目标');
    await expect(sticky.getByTestId('edit-undo')).toBeEnabled();
    await sticky.keyboard.press('Control+z');
    await expect(objective).toHaveValue('第一版目标');
    await sticky.keyboard.press('Control+Shift+z');
    await expect(objective).toHaveValue('第二版目标');
    await sticky.getByTestId('edit-undo').click();
    await expect(objective).toHaveValue('第一版目标');
    await sticky.getByTestId('edit-redo').click();
    await expect(objective).toHaveValue('第二版目标');

    // over the limit blocks saving
    await objective.fill('字'.repeat(205));
    await expect(sticky.getByTestId('edit-objective-error')).toContainText('超出 5 个字符');
    await expect(sticky.getByTestId('edit-save')).toBeDisabled();
    await shot(sticky, 'D1b-11-text-edit-limit-error');
    await axe(sticky, 'text edit limit error');
    await objective.fill('第二版目标');

    // clear the metric of KR 1, save → the row offers 添加度量
    const metric0 = sticky.getByTestId('edit-metric-0');
    await metric0.fill('');
    await sticky.getByTestId('edit-save').click();
    await expect(sticky.getByTestId('edit-button')).toBeVisible();
    await expect(sticky.getByTestId('sticky-objective')).toContainText('第二版目标');
    const add = sticky.getByTestId('sticky-key-result').nth(0).getByTestId('kr-add-metric');
    await expect(add).toHaveAccessibleName('添加度量，关键结果 1');

    // 添加度量 opens the text form with focus in that metric box
    await add.click();
    await expect(sticky.getByTestId('edit-metric-0')).toBeFocused();
    await sticky.getByTestId('edit-metric-0').fill('每周评审平均耗时（0% = 5 天，100% = 1 天）');
    await expect(sticky.getByTestId('edit-metric-0-count')).toContainText('/200');
    // undo history survives within the OKR: the metric typing can be undone
    await sticky.keyboard.press('Control+z');
    await expect(sticky.getByTestId('edit-metric-0')).toHaveValue('');
    await sticky.keyboard.press('Control+Shift+z');

    // cancel with changes asks; 继续编辑 keeps, 放弃 reverts to the last saved state
    await sticky.getByTestId('edit-cancel').click();
    await expect(sticky.getByTestId('discard-dialog')).toBeVisible();
    await expect(sticky.getByTestId('dialog-cancel')).toBeFocused();
    await expect(sticky.getByTestId('dialog-cancel')).toHaveText('继续编辑');
    await expectDialogCentred(sticky, 'discard-dialog');
    // click on the scrim, then Esc: still "继续编辑"
    await sticky.getByTestId('dialog-scrim').click({ position: { x: 4, y: 4 } });
    await expect(sticky.getByTestId('dialog-cancel')).toBeFocused();
    await expectInert(sticky, 'edit-save');
    await shot(sticky, 'D1b-12-text-edit-discard-confirm');
    await axe(sticky, 'text edit discard confirm');
    await sticky.getByTestId('dialog-cancel').click();
    await expect(sticky.getByTestId('edit-metric-0')).toHaveValue(/每周评审/);
    await sticky.getByTestId('edit-cancel').click();
    await sticky.getByTestId('dialog-confirm').click();
    await expect(
      sticky.getByTestId('sticky-key-result').nth(0).getByTestId('kr-add-metric'),
    ).toBeVisible();

    // add KR: a new empty row, focus in its text, empty blocks saving, then saves
    await sticky.getByTestId('sticky-add-kr').click();
    await expect(sticky.getByTestId('edit-kr-3')).toBeFocused();
    await expect(sticky.getByTestId('edit-save')).toBeDisabled();
    await shot(sticky, 'D1b-13-add-kr');
    await axe(sticky, 'add KR');
    await sticky.getByTestId('edit-kr-3').fill('每月至少一次复盘会');
    await sticky.getByTestId('edit-save').click();
    await expect(sticky.getByTestId('sticky-key-result')).toHaveCount(4);
    await expect(sticky.getByTestId('text-saved-live')).toContainText('文字已保存');
    await shot(sticky, 'D1b-14-kr-added');
    // progress is untouched by a text save
    await expect(sticky.getByTestId('overall-summary')).toContainText('还没有填写进度');

    // the review preview shows the new key result
    await sticky.keyboard.press('Control+2');
    await expect(sticky.getByTestId('review-row')).toHaveCount(4);
    await expect(sticky.getByTestId('review-row').nth(3)).toContainText('每月至少一次复盘会');
  });

  test('an OKR whose key results are ALL removed opens normally (real IPC)', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    const listed = await invoke(sticky, 'clarityokr:okr:list');
    const okrId = listed.data.items[0].id as string;

    // Remove every key result in the database the app itself uses (same file, main-process driver).
    const changed = await electronApp.evaluate(
      (_electron, args) => {
        const { createRequire } = (
          process as unknown as { getBuiltinModule: (id: string) => NodeModuleApi }
        ).getBuiltinModule('node:module');
        const Database = createRequire(args.mainPackage)('better-sqlite3') as unknown as new (
          path: string,
        ) => SqliteLike;
        const db = new Database(process.env['E2E_DB_PATH'] as string);
        try {
          return db
            .prepare('UPDATE key_results SET removed_at = ? WHERE objective_id = ?')
            .run('2026-10-03T08:00:00.000Z', args.okrId).changes as number;
        } finally {
          db.close();
        }
      },
      {
        okrId,
        mainPackage: fileURLToPath(new URL('../../../../app/main/package.json', import.meta.url)),
      },
    );
    expect(changed).toBe(3);

    const opened = await invoke(sticky, 'clarityokr:okr:open', { okrId });
    expect(opened.ok).toBe(true);
    expect(opened.data.objective.overallProgress).toBeNull();
    expect(
      opened.data.objective.keyResults.every((kr: { removedAt: string | null }) => kr.removedAt),
    ).toBe(true);

    // note tab: empty list text, collapsed removed section
    await sticky.getByTestId('tab-history').click();
    await sticky.getByTestId('history-item').click();
    await expect(sticky.getByTestId('tab-note')).toHaveAttribute('aria-selected', 'true');
    await expect(sticky.getByTestId('sticky-objective')).toBeVisible();
    await expect(sticky.getByTestId('kr-empty')).toContainText('还没有关键结果');
    await expect(sticky.getByTestId('overall-value')).toHaveText('—');
    await expect(sticky.getByTestId('removed-toggle')).toHaveAttribute('aria-expanded', 'false');
    await shot(sticky, 'D1b-15-only-removed-note');
    await axe(sticky, 'only-removed note');

    // review tab: the empty-KR state, and the review is still writable
    await sticky.keyboard.press('Control+2');
    await expect(sticky.getByTestId('review-no-kr')).toBeVisible();
    await sticky.getByTestId('review-wentWell').fill('没有关键结果也能写复盘');
    await sticky.keyboard.press('Control+s');
    await expect(sticky.getByTestId('toast-success')).toBeVisible();
    await shot(sticky, 'D1b-16-only-removed-review');
    await axe(sticky, 'only-removed review');
  });
});
