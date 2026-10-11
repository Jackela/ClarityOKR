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
  // Wait for running CSS transitions (bar fills) so the picture shows final values.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
  await page.screenshot({ path: join(SHOTS_DIR, `${name}.png`) });
}

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

/** axe runs for the states that only exist while a popover is open or an input is invalid. */
async function expectNoAxeViolationsInOverlays(page: Page): Promise<void> {
  const first = page.getByTestId('sticky-key-result').nth(0);
  const check = async (name: string): Promise<void> => {
    const violations = await runAxe(page);
    expect(violations, `${name}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
  };

  await first.getByTestId('kr-status').click();
  await expect(page.locator('[role="menu"]')).toBeVisible();
  await check('status menu');
  await page.keyboard.press('Escape');

  await page.getByTestId('period-picker').click();
  await expect(page.locator('[role="listbox"]').first()).toBeVisible();
  await check('quarter picker');
  await page.keyboard.press('Escape');

  await first.getByTestId('kr-progress-value').click();
  await first.getByTestId('kr-progress-input').fill('140');
  await expect(first.getByTestId('kr-input-error')).toBeVisible();
  await check('progress input error');
  await first.getByTestId('kr-progress-input').press('Escape');
  await expect(first.getByTestId('kr-progress-value')).toBeVisible();
}

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
    // §3.6 disabled look: secondary colour, no underline, still focusable
    for (const id of ['kr-edit-last', 'kr-revert-last']) {
      const button = first.getByTestId(id);
      await expect(button).toHaveAttribute('aria-disabled', 'true');
      await expect(button).toHaveCSS('text-decoration-line', 'none');
      await expect(button).toHaveCSS('cursor', 'not-allowed');
      const colors = await button.evaluate((el) => ({
        own: getComputedStyle(el).color,
        secondary: getComputedStyle(
          document.querySelector('[data-testid="overall-summary"]') as Element,
        ).color,
      }));
      expect(colors.own).toBe(colors.secondary);
    }
    await expect(first.getByTestId('kr-revert-reason')).toBeVisible();
    // clicking a disabled revert / edit button changes nothing
    const lineBefore = await first.getByTestId('kr-update-line').textContent();
    // force: Playwright treats aria-disabled as "not enabled" and would wait forever
    await first.getByTestId('kr-revert-last').click({ force: true });
    await first.getByTestId('kr-edit-last').click({ force: true });
    await expect(first.getByTestId('kr-progress-input')).toHaveCount(0);
    await expect(first.getByTestId('kr-update-line')).toHaveText(lineBefore ?? '');
    await expect(first.getByTestId('kr-progress-value')).toHaveText('40%');
    await shot(sticky, 'D1a-05-reverted');

    // Esc cancels an edit without saving
    await first.getByTestId('kr-progress-value').click();
    await first.getByTestId('kr-progress-input').fill('77');
    await first.getByTestId('kr-progress-input').press('Escape');
    await expect(first.getByTestId('kr-progress-value')).toHaveText('40%');

    const violations = await runAxe(sticky);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    await expectNoAxeViolationsInOverlays(sticky);

    // dark theme: same page (hint + disabled-free update row visible), axe + screenshots
    await sticky.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await shot(sticky, 'D1a-08-dark-sticky');
    const darkNote = await runAxe(sticky);
    expect(darkNote, JSON.stringify(darkNote, null, 2)).toEqual([]);
    await expectNoAxeViolationsInOverlays(sticky);
    await sticky.getByTestId('tab-history').click();
    await expect(sticky.getByTestId('history-item')).toHaveCount(1);
    await shot(sticky, 'D1a-09-dark-history');
    const darkHistory = await runAxe(sticky);
    expect(darkHistory, JSON.stringify(darkHistory, null, 2)).toEqual([]);
  });

  test('修改这次 replaces the latest value, and a non-pinned OKR can be pinned from the history', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    const first = sticky.getByTestId('sticky-key-result').nth(0);
    await first.getByTestId('kr-progress-value').click();
    await first.getByTestId('kr-progress-input').fill('40');
    await first.getByTestId('kr-progress-input').press('Enter');
    await expect(first.getByTestId('kr-progress-value')).toHaveText('40%');

    // 修改这次: the input is prefilled with the current value; the result is one set after a revert
    await first.getByTestId('kr-edit-last').click();
    const input = first.getByTestId('kr-progress-input');
    await expect(input).toHaveValue('40');
    await input.fill('55');
    await input.press('Enter');
    await expect(first.getByTestId('kr-progress-value')).toHaveText('55%');
    await expect(sticky.getByTestId('overall-value')).toHaveText('55%');
    await expect(first.getByTestId('kr-update-line')).toContainText('— → 55%');
    await expect(first.getByTestId('kr-revert-last')).not.toHaveAttribute('aria-disabled', 'true');
    // the same value again writes nothing and just closes the input
    await first.getByTestId('kr-edit-last').click();
    await first.getByTestId('kr-progress-input').press('Enter');
    await expect(first.getByTestId('kr-progress-value')).toHaveText('55%');

    // a second OKR (the wizard is reset by reloading the main window)
    await mockServer.setResponses(mockFor('第二个目标'));
    await mainWindow.reload();
    const clarification = new ClarificationPage(mainWindow);
    await clarification.waitForReady();
    await clarification.completeClarificationFlow('第二个目标', {
      questionCount: 2,
      selectOptionIndex: 0,
      finalOptionIndex: 1,
    });
    await clarification.waitForOkrSummary(30000);

    // the second OKR is saved by the main process right after generation
    await expect
      .poll(
        () =>
          sticky.evaluate(async () => {
            const bridge = (
              window as unknown as {
                clarifyOkr: { invoke: (c: string, p: unknown) => Promise<unknown> };
              }
            ).clarifyOkr;
            const reply = (await bridge.invoke('clarityokr:okr:list', undefined)) as {
              data?: { items: unknown[] };
            };
            return reply.data?.items.length ?? 0;
          }),
        { timeout: 20_000 },
      )
      .toBe(2);
    await sticky.getByTestId('tab-history').click();
    const items = sticky.getByTestId('history-item');
    await expect(items).toHaveCount(2);
    const unpinned = items.filter({ hasNotText: '置顶' });
    await expect(unpinned).toHaveCount(1);
    await unpinned.click();
    await expect(sticky.getByTestId('tab-note')).toHaveAttribute('aria-selected', 'true');
    await expect(sticky.getByTestId('pin-banner')).toContainText('这不是置顶便签。');
    await sticky.getByTestId('pin-button').click();
    await expect(sticky.getByTestId('pin-banner-done')).toContainText('已设为置顶便签');
    await sticky.getByTestId('tab-history').click();
    await expect(items.filter({ hasText: '置顶' })).toHaveCount(1);
    await expect(items.filter({ hasText: '当前打开' })).toContainText('置顶');
    // the mini progress bar really paints its fill (a stray ::before once pushed it out of the track)
    const track = await sticky.locator('.item__mini').first().boundingBox();
    const fillBox = await sticky.locator('.item__mini-fill').first().boundingBox();
    expect(track && fillBox).toBeTruthy();
    expect(Math.abs(fillBox!.y - track!.y)).toBeLessThan(1);
    expect(fillBox!.width).toBeGreaterThan(5);
    await shot(sticky, 'D1a-10-history-two-okrs');
  });

  test('bar fills do not animate under prefers-reduced-motion', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    const sticky = await openSticky(electronApp, mainWindow, mockServer);
    const first = sticky.getByTestId('sticky-key-result').nth(0);
    await first.getByTestId('kr-progress-value').click();
    await first.getByTestId('kr-progress-input').fill('40');
    await first.getByTestId('kr-progress-input').press('Enter');
    const fill = first.locator('.meter__fill');
    await expect(fill).toHaveCount(1);

    await sticky.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(fill).toHaveCSS('transition-duration', '0.2s');
    await sticky.emulateMedia({ reducedMotion: 'reduce' });
    // the global reduced-motion rule clamps durations to ~0 (Chromium reports 0.01ms as 1e-05s)
    await expect
      .poll(() => fill.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration)))
      .toBeLessThanOrEqual(0.001);

    // while reduced, a new value is applied at once: no animation on the fill lasts longer than 1ms
    await first.getByTestId('kr-progress-value').click();
    await first.getByTestId('kr-progress-input').fill('90');
    await first.getByTestId('kr-progress-input').press('Enter');
    await expect(first.getByTestId('kr-progress-bar')).toHaveAttribute('aria-valuenow', '90');
    const longest = await fill.evaluate((el) =>
      Math.max(0, ...el.getAnimations().map((a) => Number(a.effect?.getTiming().duration ?? 0))),
    );
    expect(longest).toBeLessThanOrEqual(1);
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
