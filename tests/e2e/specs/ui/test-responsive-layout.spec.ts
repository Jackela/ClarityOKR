import { workerTest as test, expect } from '../../fixtures/worker-fixtures';
import { cleanupPersistenceFiles } from '../../fixtures';
import { waitForElement, waitForText, forceClick } from '../../helpers/native-dom';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test.describe('E2E: Responsive Layout', () => {
  test('should adapt layout to different desktop sizes', async ({ mainWindow, mockServer }) => {
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '响应式测试目标',
              description: '测试响应式布局',
              keyResults: [{ id: 'kr1', statement: 'KR1', target: '100%', measurement: 'rate' }],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Test different desktop sizes
    const desktopSizes = [
      { width: 1920, height: 1080, name: 'large-desktop' },
      { width: 1440, height: 900, name: 'medium-desktop' },
      { width: 1280, height: 720, name: 'small-desktop' },
      { width: 1024, height: 768, name: 'tablet-landscape' },
    ];

    for (const size of desktopSizes) {
      // Resize window
      await mainWindow.setViewportSize({ width: size.width, height: size.height });
      await mainWindow.waitForTimeout(500);

      // Verify main content is visible
      const intentInputVisible = await waitForElement(mainWindow, '[data-testid="intent-input"]', {
        timeout: 5000,
      });
      expect(intentInputVisible).toBe(true);

      // Generate OKR and check layout
      await mainWindow.fill('[data-testid="intent-input"]', `响应式测试${size.name}`);
      await mainWindow.click('[data-testid="start-clarification"]');
      await waitForElement(mainWindow, '[data-testid="clarification-generate"]', {
        timeout: 15000,
      });
      await forceClick(mainWindow, '[data-testid="clarification-generate"]');
      await waitForText(mainWindow, '[data-testid="okr-summary"]', '响应式测试目标', 15000);

      // Take screenshot for each size
      await mainWindow.screenshot({ path: `test-results/responsive-${size.name}.png` });

      // Reset for next iteration
      await mainWindow.reload();
      await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    }
  });

  test('should handle tablet viewport', async ({ mainWindow, mockServer }) => {
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '平板测试目标',
              description: '测试平板布局',
              keyResults: [{ id: 'kr1', statement: '平板KR', target: '100%', measurement: 'rate' }],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Set tablet size
    await mainWindow.setViewportSize({ width: 768, height: 1024 });
    await mainWindow.waitForTimeout(500);

    // Verify content is accessible
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '平板测试');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    // Verify OKR is displayed
    const okrVisible = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '平板测试目标',
      15000,
    );
    expect(okrVisible).toBe(true);

    // Check if layout adjusted (elements should not overlap)
    const hasOverlappingElements = await mainWindow.evaluate(() => {
      const elements = document.querySelectorAll('[data-testid]');
      const rects: DOMRect[] = [];

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const rect = el.getBoundingClientRect();
        // Check if element is visible and has size
        if (rect.width > 0 && rect.height > 0) {
          // Check overlap with previous elements
          for (let j = 0; j < rects.length; j++) {
            const prevRect = rects[j];
            if (
              !(
                rect.right < prevRect.left ||
                rect.left > prevRect.right ||
                rect.bottom < prevRect.top ||
                rect.top > prevRect.bottom
              )
            ) {
              return true;
            }
          }
          rects.push(rect);
        }
      }
      return false;
    });

    expect(hasOverlappingElements).toBe(false);

    await mainWindow.screenshot({ path: 'test-results/responsive-tablet.png' });
  });

  test('should handle mobile viewport', async ({ mainWindow, mockServer }) => {
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '移动端测试目标',
              description: '测试移动端布局',
              keyResults: [{ id: 'kr1', statement: '移动KR', target: '100%', measurement: 'rate' }],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Set mobile size
    await mainWindow.setViewportSize({ width: 375, height: 667 });
    await mainWindow.waitForTimeout(500);

    // Verify content is accessible
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });

    // Check that input field is usable
    await mainWindow.fill('[data-testid="intent-input"]', '移动端测试');
    const inputValue = await mainWindow.inputValue('[data-testid="intent-input"]');
    expect(inputValue).toBe('移动端测试');

    // Start clarification
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    // Verify OKR is displayed and readable
    const okrVisible = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '移动端测试目标',
      15000,
    );
    expect(okrVisible).toBe(true);

    // Check if font size is appropriate for mobile
    const fontSize = await mainWindow.evaluate(() => {
      const okrSummary = document.querySelector('[data-testid="okr-summary"]');
      if (okrSummary) {
        const style = window.getComputedStyle(okrSummary);
        return parseInt(style.fontSize, 10);
      }
      return 0;
    });

    // Font size should be at least 12px for readability
    expect(fontSize).toBeGreaterThanOrEqual(12);

    await mainWindow.screenshot({ path: 'test-results/responsive-mobile.png' });
  });

  test('should handle window resize gracefully', async ({ mainWindow, mockServer }) => {
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '调整大小测试目标',
              description: '测试窗口调整',
              keyResults: [{ id: 'kr1', statement: '调整KR', target: '100%', measurement: 'rate' }],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Start with large window
    await mainWindow.setViewportSize({ width: 1440, height: 900 });
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '调整大小测试');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');
    await waitForText(mainWindow, '[data-testid="okr-summary"]', '调整大小测试目标', 15000);

    // Rapidly resize window multiple times
    const sizes = [
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 },
      { width: 1440, height: 900 },
    ];

    for (const size of sizes) {
      await mainWindow.setViewportSize({ width: size.width, height: size.height });
      await mainWindow.waitForTimeout(300);

      // Verify content is still visible
      const contentVisible = await waitForElement(mainWindow, '[data-testid="okr-summary"]', {
        timeout: 5000,
      });
      expect(contentVisible).toBe(true);
    }

    // Final screenshot
    await mainWindow.screenshot({ path: 'test-results/responsive-resize.png' });
  });
});
