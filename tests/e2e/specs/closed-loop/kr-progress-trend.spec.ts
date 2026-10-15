import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { axe, openSticky, setTheme, shot } from '../../helpers/closed-loop';

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
  await panel.scrollIntoViewIfNeeded();
  await shot(sticky, 'S1-40-history-3-updates-1-revert-light');
  await axe(sticky, 'history panel');
  await setTheme(sticky, 'dark');
  await shot(sticky, 'S1-41-history-3-updates-1-revert-dark');
  await setTheme(sticky, 'light');
});
