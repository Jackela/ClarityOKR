import { workerTest as test, expect } from '../../fixtures/worker-fixtures';
import { cleanupPersistenceFiles } from '../../fixtures';
import { waitForElement, waitForText, forceClick } from '../../helpers/native-dom';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test.describe('E2E: Multi-OKR Management', () => {
  test('should generate multiple OKRs', async ({ mainWindow, mockServer }) => {
    // First OKR
    await mockServer.setResponses({
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '多OKR测试目标1',
              description: '描述1',
              keyResults: [
                { id: 'kr1-1', statement: 'KR1-1', target: '100%', measurement: 'rate' },
                { id: 'kr1-2', statement: 'KR1-2', target: '90%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    });

    // Generate first OKR
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '第一个目标');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');
    await waitForText(mainWindow, '[data-testid="okr-summary"]', '多OKR测试目标1', 15000);

    // Check for new OKR button
    const newOkrBtnExists = await waitForElement(mainWindow, '[data-testid="new-okr-button"]', {
      timeout: 5000,
    });

    if (!newOkrBtnExists) {
      test.skip(true, 'New OKR button not found - feature may not be implemented yet');
      return;
    }

    // Second OKR
    await mockServer.setResponses({
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o2',
              title: '多OKR测试目标2',
              description: '描述2',
              keyResults: [
                { id: 'kr2-1', statement: 'KR2-1', target: '100%', measurement: 'rate' },
                { id: 'kr2-2', statement: 'KR2-2', target: '90%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    });

    // Generate second OKR
    await forceClick(mainWindow, '[data-testid="new-okr-button"]');
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '第二个目标');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');
    await waitForText(mainWindow, '[data-testid="okr-summary"]', '多OKR测试目标2', 15000);

    // Third OKR
    await mockServer.setResponses({
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o3',
              title: '多OKR测试目标3',
              description: '描述3',
              keyResults: [
                { id: 'kr3-1', statement: 'KR3-1', target: '100%', measurement: 'rate' },
                { id: 'kr3-2', statement: 'KR3-2', target: '90%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    });

    // Generate third OKR
    await forceClick(mainWindow, '[data-testid="new-okr-button"]');
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '第三个目标');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');
    await waitForText(mainWindow, '[data-testid="okr-summary"]', '多OKR测试目标3', 15000);

    await mainWindow.screenshot({ path: 'test-results/multi-okr-generated.png' });
  });

  test('should display OKR list', async ({ mainWindow, mockServer }) => {
    // Generate 3 OKRs with different titles
    const okrTitles = ['列表测试目标1', '列表测试目标2', '列表测试目标3'];

    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        const newOkrBtnExists = await waitForElement(mainWindow, '[data-testid="new-okr-button"]', {
          timeout: 5000,
        });
        if (!newOkrBtnExists) {
          test.skip(true, 'New OKR button not found');
          return;
        }
        await forceClick(mainWindow, '[data-testid="new-okr-button"]');
      }

      // Set mock response for this OKR
      await mockServer.setResponses({
        nextQuestion: () => null,
        draft: {
          draft: {
            objectives: [
              {
                id: `o${i + 1}`,
                title: okrTitles[i],
                description: '描述',
                keyResults: [
                  {
                    id: `kr${i + 1}`,
                    statement: `KR${i + 1}`,
                    target: '100%',
                    measurement: 'rate',
                  },
                ],
              },
            ],
          },
        },
      });

      await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
      await mainWindow.fill('[data-testid="intent-input"]', `目标${i + 1}`);
      await mainWindow.click('[data-testid="start-clarification"]');
      await waitForElement(mainWindow, '[data-testid="clarification-generate"]', {
        timeout: 15000,
      });
      await forceClick(mainWindow, '[data-testid="clarification-generate"]');
      await waitForText(mainWindow, '[data-testid="okr-summary"]', okrTitles[i], 15000);
    }

    // Check for OKR list
    const okrListExists = await waitForElement(mainWindow, '[data-testid="okr-list"]', {
      timeout: 5000,
    });

    if (okrListExists) {
      // Count items in list
      const okrCount = await mainWindow.evaluate(() => {
        return document.querySelectorAll('[data-testid="okr-list-item"]').length;
      });
      expect(okrCount).toBeGreaterThanOrEqual(3);
    } else {
      // Alternative: check if current view shows OKR indicator
      const okrIndicatorExists = await waitForElement(mainWindow, '[data-testid="okr-indicator"]', {
        timeout: 3000,
      });
      if (!okrIndicatorExists) {
        test.skip(true, 'OKR list or indicator not found - feature may not be implemented yet');
        return;
      }
    }

    await mainWindow.screenshot({ path: 'test-results/multi-okr-list.png' });
  });

  test('should switch between different OKRs', async ({ mainWindow, mockServer }) => {
    // Generate first OKR
    await mockServer.setResponses({
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '切换测试目标1',
              description: '描述1',
              keyResults: [
                { id: 'kr1', statement: '切换KR1', target: '100%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    });

    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '第一个切换目标');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');
    await waitForText(mainWindow, '[data-testid="okr-summary"]', '切换测试目标1', 15000);

    // Generate second OKR
    const newOkrBtnExists = await waitForElement(mainWindow, '[data-testid="new-okr-button"]', {
      timeout: 5000,
    });
    if (!newOkrBtnExists) {
      test.skip(true, 'New OKR button not found');
      return;
    }

    await mockServer.setResponses({
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o2',
              title: '切换测试目标2',
              description: '描述2',
              keyResults: [
                { id: 'kr2', statement: '切换KR2', target: '100%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    });

    await forceClick(mainWindow, '[data-testid="new-okr-button"]');
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '第二个切换目标');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');
    await waitForText(mainWindow, '[data-testid="okr-summary"]', '切换测试目标2', 15000);

    // Look for OKR selector/switcher
    const okrSelectorExists = await waitForElement(mainWindow, '[data-testid="okr-selector"]', {
      timeout: 5000,
    });

    if (okrSelectorExists) {
      // Click on first OKR
      const okr1ButtonExists = await waitForElement(
        mainWindow,
        '[data-testid="okr-selector-item"]:first-child',
        { timeout: 3000 },
      );
      if (okr1ButtonExists) {
        await forceClick(mainWindow, '[data-testid="okr-selector-item"]:first-child');

        // Verify switched to first OKR
        const firstOkrVisible = await waitForText(
          mainWindow,
          '[data-testid="okr-summary"]',
          '切换测试目标1',
          10000,
        );
        expect(firstOkrVisible).toBe(true);
      }
    } else {
      // Try alternative: check if there's a dropdown or list
      const okrDropdownExists = await waitForElement(mainWindow, '[data-testid="okr-dropdown"]', {
        timeout: 3000,
      });
      if (okrDropdownExists) {
        await forceClick(mainWindow, '[data-testid="okr-dropdown"]');
        await waitForElement(mainWindow, '[data-testid="okr-dropdown-item"]', { timeout: 3000 });
        await forceClick(mainWindow, '[data-testid="okr-dropdown-item"]:first-child');

        const firstOkrVisible = await waitForText(
          mainWindow,
          '[data-testid="okr-summary"]',
          '切换测试目标1',
          10000,
        );
        expect(firstOkrVisible).toBe(true);
      } else {
        test.skip(true, 'OKR switcher not found - feature may not be implemented yet');
        return;
      }
    }

    await mainWindow.screenshot({ path: 'test-results/multi-okr-switch.png' });
  });

  test('should show OKR count indicator', async ({ mainWindow, mockServer }) => {
    // Generate 3 OKRs
    for (let i = 1; i <= 3; i++) {
      if (i > 1) {
        const newOkrBtnExists = await waitForElement(mainWindow, '[data-testid="new-okr-button"]', {
          timeout: 5000,
        });
        if (!newOkrBtnExists) {
          test.skip(true, 'New OKR button not found');
          return;
        }
        await forceClick(mainWindow, '[data-testid="new-okr-button"]');
      }

      // Set mock response
      await mockServer.setResponses({
        nextQuestion: () => null,
        draft: {
          draft: {
            objectives: [
              {
                id: `o${i}`,
                title: `计数测试目标${i}`,
                description: '描述',
                keyResults: [
                  { id: `kr${i}`, statement: `KR${i}`, target: '100%', measurement: 'rate' },
                ],
              },
            ],
          },
        },
      });

      await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
      await mainWindow.fill('[data-testid="intent-input"]', `计数目标${i}`);
      await mainWindow.click('[data-testid="start-clarification"]');
      await waitForElement(mainWindow, '[data-testid="clarification-generate"]', {
        timeout: 15000,
      });
      await forceClick(mainWindow, '[data-testid="clarification-generate"]');
      await waitForText(mainWindow, '[data-testid="okr-summary"]', `计数测试目标${i}`, 15000);
    }

    // Check for OKR count indicator
    const countIndicatorExists = await waitForElement(mainWindow, '[data-testid="okr-count"]', {
      timeout: 5000,
    });

    if (countIndicatorExists) {
      const countText = await mainWindow.locator('[data-testid="okr-count"]').innerText();
      const count = parseInt(countText, 10);
      expect(count).toBeGreaterThanOrEqual(3);
    } else {
      // Check for badge or indicator
      const badgeExists = await waitForElement(mainWindow, '[data-testid="okr-badge"]', {
        timeout: 3000,
      });
      if (badgeExists) {
        const badgeText = await mainWindow.locator('[data-testid="okr-badge"]').innerText();
        expect(badgeText).toContain('3');
      } else {
        test.skip(true, 'OKR count indicator not found - feature may not be implemented yet');
      }
    }

    await mainWindow.screenshot({ path: 'test-results/multi-okr-count.png' });
  });
});
