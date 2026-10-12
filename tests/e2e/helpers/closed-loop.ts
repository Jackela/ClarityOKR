import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { MockResponseConfig } from '@clarityokr/contracts';

import { expect } from '../fixtures';
import { ClarificationPage, waitForStickyWindow } from '../page-objects';
import { forceClick, waitForElement } from './native-dom';
import { runAxe } from './axe';

/** Shared by the closed-loop e2e specs (screenshots, axe, themes, dialog geometry, real OKR). */

const SHOTS_DIR = process.env.IMPL_SHOTS_DIR;

export async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS_DIR) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // a spinner never finishes: only wait for animations that have an end
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  await page.screenshot({ path: join(SHOTS_DIR, `${name}.png`) });
}

export async function axe(page: Page, name: string): Promise<void> {
  const violations = await runAxe(page);
  expect(violations, `${name}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

/** The confirm dialog: centred, ≥24px from the top, both buttons fully inside the window. */
export async function expectDialogCentred(page: Page, testId: string): Promise<void> {
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
export async function expectInert(page: Page, testId: string): Promise<void> {
  const inert = await page.evaluate(
    (id) => document.querySelector(`[data-testid="${id}"]`)?.closest('[inert]') !== null,
    testId,
  );
  expect(inert, `${testId} is inert behind the dialog`).toBe(true);
}

export const setTheme = (page: Page, theme: 'light' | 'dark'): Promise<void> =>
  page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);

export const mockFor = (title: string): MockResponseConfig => ({
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

export async function openSticky(
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

// The reply shape differs per channel; the specs assert on it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const invoke = (page: Page, channel: string, payload?: unknown): Promise<any> =>
  page.evaluate(
    ([c, p]) =>
      (
        window as unknown as { clarifyOkr: { invoke: (c: string, p: unknown) => Promise<unknown> } }
      ).clarifyOkr.invoke(c as string, p),
    [channel, payload] as const,
  );
