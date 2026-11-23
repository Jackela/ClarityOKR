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

/**
 * Fixed content size of every main-window design shot (#146).
 *
 * The main window is a framed 1200×800 *outer* window, so on Linux/Xvfb its client area is
 * 800 minus a native title bar that has measured 29px on some runs and 27px on others
 * (1200×771 vs 1200×773). The root component's `min-height: 100vh` follows that, so the
 * bottom bar and centred dialogs moved by 1–2px between otherwise identical builds.
 * Shots now lay the page out and capture it at this size, whatever the title bar is.
 * 771 = the long-standing design baseline (800 − 29). Test-only: the real window is untouched.
 */
export const MAIN_SHOT_SIZE = { width: 1200, height: 771 } as const;

const animationsDone = (page: Page): Promise<unknown> =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // a spinner never finishes: only wait for animations that have an end
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );

const twoFrames = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

/** PNG width/height from the IHDR chunk. */
const pngSize = (png: Buffer): { width: number; height: number } => ({
  width: png.readUInt32BE(16),
  height: png.readUInt32BE(20),
});

export async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS_DIR) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  await animationsDone(page);
  await capture(page, join(SHOTS_DIR, `${name}.png`), name);
}

/**
 * Writes a PNG of `page`. Sticky notes are frameless (`frame: false`): their client size is
 * their window size, so they are captured as they are. The framed main window is laid out
 * and captured at {@link MAIN_SHOT_SIZE} (#146), then given back its real viewport.
 */
export async function capture(page: Page, path: string, name: string): Promise<void> {
  const sticky = await page.evaluate(
    () => new URLSearchParams(window.location.search).get('view') === 'sticky',
  );
  if (sticky) {
    await page.screenshot({ path });
    return;
  }
  const actual = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expect(actual.width, `${name}: main-window shots are taken 1200 wide`).toBe(MAIN_SHOT_SIZE.width);
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      ...MAIN_SHOT_SIZE,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await expect
      .poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]), {
        message: `${name}: viewport fixed at ${MAIN_SHOT_SIZE.width}×${MAIN_SHOT_SIZE.height}`,
      })
      .toEqual([MAIN_SHOT_SIZE.width, MAIN_SHOT_SIZE.height]);
    await twoFrames(page);
    await animationsDone(page);
    const png = await page.screenshot({ path });
    expect(pngSize(png), `${name}: main-window shot size`).toEqual(MAIN_SHOT_SIZE);
  } finally {
    await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
  if (actual.height !== MAIN_SHOT_SIZE.height) {
    // the real client area is back; let the layout settle before the test goes on
    await twoFrames(page);
  }
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

/**
 * Switches the theme and waits until the colour transitions it starts have ended, so a
 * screenshot / axe run right after it never sees half-blended colours.
 */
export const setTheme = (page: Page, theme: 'light' | 'dark'): Promise<void> =>
  page.evaluate(async (value) => {
    document.documentElement.setAttribute('data-theme', value);
    const frame = (): Promise<void> =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await frame();
    await frame();
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
  }, theme);

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
