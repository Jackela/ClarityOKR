import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { MockResponseConfig } from '@clarityokr/contracts';

import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage, waitForStickyWindow } from '../../page-objects';
import { forceClick, waitForElement } from '../../helpers/native-dom';
import { runAxe } from '../../helpers/axe';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

const SHOTS_DIR = process.env.IMPL_SHOTS_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS_DIR) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOTS_DIR, `${name}.png`) });
}

const mockConfig: MockResponseConfig = {
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
          title: '提高团队效率',
          description: '自动生成',
          keyResults: [
            { id: 'kr1', statement: '代码评审缩短到两天内', target: '2天', measurement: 'time' },
            { id: 'kr2', statement: '测试覆盖率提升到 80%', target: '80%', measurement: 'rate' },
            { id: 'kr3', statement: '发布频率提升到每周两次', target: '2次', measurement: 'count' },
          ],
        },
      ],
    },
  },
};

async function openSticky(
  electronApp: Parameters<typeof waitForStickyWindow>[0],
  mainWindow: Page,
  mockServer: { setResponses: (c: MockResponseConfig) => Promise<void> },
): Promise<Page> {
  const clarification = new ClarificationPage(mainWindow);
  await mockServer.setResponses(mockConfig);
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

test.describe('closed loop: progress, history, period (D1a)', () => {
  test('edit, change status, hint, revert and undo semantics', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    const rows = sticky.getByTestId('sticky-key-result');
    await expect(rows).toHaveCount(3);
    await expect(sticky.getByTestId('overall-summary')).toContainText('还没有填写进度');
    await shot(sticky, 'D1a-01-note-empty-progress');

    // set 40 on KR1 with the keyboard
    const first = rows.nth(0);
    await first.getByTestId('kr-progress-value').click();
    const input = first.getByTestId('kr-progress-input');
    await expect(input).toBeFocused();
    await input.fill('140');
    await expect(first.getByTestId('kr-input-error')).toContainText('不能超过 100');
    await shot(sticky, 'D1a-02-progress-input-error');
    await input.fill('40');
    await input.press('Enter');
    await expect(first.getByTestId('kr-progress-value')).toHaveText('40%');
    await expect(first.getByTestId('kr-progress-value')).toBeFocused();
    await expect(sticky.getByTestId('overall-value')).toHaveText('40%');
    await expect(first.getByTestId('kr-update-line')).toContainText('— → 40%');
    await shot(sticky, 'D1a-03-progress-set');

    // status → done with 40% shows the hint; "改为 100%" clears it
    await first.getByTestId('kr-status').click();
    await first.getByTestId('kr-status-option-3').click();
    await expect(first.getByTestId('kr-done-hint')).toBeVisible();
    await shot(sticky, 'D1a-04-done-not-100-hint');
    await first.getByTestId('kr-set-100').click();
    await expect(first.getByTestId('kr-progress-value')).toHaveText('100%');
    await expect(first.getByTestId('kr-done-hint')).toHaveCount(0);

    // revert last entry (100) → back to 40, status done again → hint returns
    await first.getByTestId('kr-revert-last').click();
    await expect(first.getByTestId('kr-progress-value')).toHaveText('40%');
    await expect(first.getByTestId('kr-update-line')).toContainText('已撤回上一次更新');
    // an undo cannot be undone again
    await expect(first.getByTestId('kr-revert-last')).toHaveAttribute('aria-disabled', 'true');
    await shot(sticky, 'D1a-05-reverted');

    // Esc cancels an edit without saving
    await first.getByTestId('kr-progress-value').click();
    await first.getByTestId('kr-progress-input').fill('77');
    await first.getByTestId('kr-progress-input').press('Escape');
    await expect(first.getByTestId('kr-progress-value')).toHaveText('40%');

    const violations = await runAxe(sticky);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('history tab lists the OKR, period picker saves, tab keyboard + axe', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);

    // quarter picker
    await sticky.getByTestId('period-picker').click();
    await shot(sticky, 'D1a-06-period-open');
    const options = sticky.locator('[data-testid^="period-picker-option-"]');
    await expect(options).toHaveCount(10);
    await options.nth(5).click();
    await expect(sticky.getByTestId('period-picker')).toContainText(/\d{4}-Q[1-4]/);
    await expect(sticky.getByTestId('period-live')).toContainText('周期已设为');

    // history tab (arrow keys move between tabs)
    await sticky.getByTestId('tab-note').focus();
    await sticky.keyboard.press('ArrowRight');
    await expect(sticky.getByTestId('tab-history')).toHaveAttribute('aria-selected', 'true');
    await expect(sticky.getByTestId('history-item')).toHaveCount(1);
    await expect(sticky.getByTestId('history-item')).toContainText('提高团队效率');
    await expect(sticky.getByTestId('history-item')).toContainText('当前打开');
    await shot(sticky, 'D1a-07-history');
    const historyViolations = await runAxe(sticky);
    expect(historyViolations, JSON.stringify(historyViolations, null, 2)).toEqual([]);

    // opening the item returns to the note tab with the title focused
    await sticky.getByTestId('history-item').press('Enter');
    await expect(sticky.getByTestId('tab-note')).toHaveAttribute('aria-selected', 'true');
    await expect(sticky.getByTestId('sticky-objective')).toBeVisible();
  });
});
