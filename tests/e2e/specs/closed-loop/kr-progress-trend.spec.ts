import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import type { Locator, Page } from '@playwright/test';

import { axe, openSticky, setTheme, shot } from '../../helpers/closed-loop';

async function both(page: Page, panel: Locator, name: string): Promise<void> {
  await panel.scrollIntoViewIfNeeded();
  await shot(page, `${name}-light`);
  await setTheme(page, 'dark');
  await shot(page, `${name}-dark`);
  await setTheme(page, 'light');
}

async function setValue(row: Locator, v: string): Promise<void> {
  await row.getByTestId('kr-progress-value').click();
  await row.getByTestId('kr-progress-input').fill(v);
  await row.getByTestId('kr-progress-input').press('Enter');
  await expect(row.getByTestId('kr-progress-value')).toHaveText(v === '' ? /未填写|—/ : `${v}%`);
}

/** #53 KR progress trend (spec S1§10) against the real main process and SQLite. */

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test('3 updates + 1 revert: chart, list tags, keyboard, paging-free', async ({
  electronApp,
  mainWindow,
  mockServer,
}) => {
  test.setTimeout(120_000);
  const sticky = await openSticky(electronApp, mainWindow, mockServer);
  const first = sticky.getByTestId('sticky-key-result').nth(0);

  // no records yet: no toggle (it sits on the 「最近一次更新」 line)
  await expect(first.getByTestId('kr-history-toggle')).toHaveCount(0);

  for (const v of ['20', '45', '70']) {
    await first.getByTestId('kr-progress-value').click();
    await first.getByTestId('kr-progress-input').fill(v);
    await first.getByTestId('kr-progress-input').press('Enter');
    await expect(first.getByTestId('kr-progress-value')).toHaveText(`${v}%`);
  }
  await first.getByTestId('kr-revert-last').click();
  await expect(first.getByTestId('kr-progress-value')).toHaveText('45%');

  // keyboard opens the panel
  const toggle = first.getByTestId('kr-history-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await sticky.keyboard.press('Enter');
  const panel = first.getByTestId('kr-history-panel');
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(first.getByTestId('kr-history-chart')).toBeVisible();
  await expect(first.getByTestId('kr-history-reverted')).toHaveCount(1);
  await expect(first.getByTestId('kr-history-summary')).toContainText('20');
  await expect(first.getByTestId('kr-history-summary')).toContainText('45');
  await axe(sticky, 'history panel');
  await both(sticky, panel, 'S1-40-history-3-updates-1-revert');
  await toggle.click();

  // S1-43: one record → one dot, no line
  const second = sticky.getByTestId('sticky-key-result').nth(1);
  await setValue(second, '30');
  await second.getByTestId('kr-history-toggle').click();
  const p2 = second.getByTestId('kr-history-panel');
  await expect(second.getByTestId('kr-history-dot')).toHaveCount(1);
  await expect(second.getByTestId('kr-history-line')).toHaveCount(0);
  await expect(second.getByTestId('kr-history-summary')).toHaveText('目前 30%，共 1 次更新');
  // S1-43: the time label is centred on the dot on screen (within 2px)
  const centre = async (l: Locator) => {
    const b = (await l.boundingBox())!;
    return b.x + b.width / 2;
  };
  expect(
    Math.abs(
      (await centre(second.getByTestId('kr-history-single-date'))) -
        (await centre(second.getByTestId('kr-history-dot'))),
    ),
  ).toBeLessThanOrEqual(2);
  await both(sticky, p2, 'S1-43-history-single');
  await second.getByTestId('kr-history-toggle').click();

  // S1-44: 「修改这次」 → 「已修改」 tag; S1-46: a cleared value breaks the line
  const third = sticky.getByTestId('sticky-key-result').nth(2);
  await setValue(third, '10');
  await setValue(third, '25');
  await third.getByTestId('kr-edit-last').click();
  await third.getByTestId('kr-progress-input').fill('35');
  await third.getByTestId('kr-progress-input').press('Enter');
  await expect(third.getByTestId('kr-progress-value')).toHaveText('35%');
  await third.getByTestId('kr-history-toggle').click();
  const p3 = third.getByTestId('kr-history-panel');
  await expect(third.getByTestId('kr-history-modified')).toHaveCount(1);
  await both(sticky, p3, 'S1-44-history-modified');
  await third.getByTestId('kr-history-toggle').click();
  await setValue(third, '');
  await setValue(third, '50');
  await setValue(third, '60');
  await third.getByTestId('kr-history-toggle').click();
  await expect(third.getByTestId('kr-history-line')).toHaveCount(2);
  await both(sticky, p3, 'S1-46-history-cleared-gap');
});
