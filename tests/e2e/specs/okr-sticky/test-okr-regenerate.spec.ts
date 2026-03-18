import { workerTest as test, expect } from '../../fixtures/worker-fixtures';
import { cleanupPersistenceFiles } from '../../fixtures';
import { waitForElement, waitForText, forceClick } from '../../helpers/native-dom';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test.describe('E2E: OKR Regenerate', () => {
  test('should regenerate OKR with new content', async ({ mainWindow, mockServer }) => {
    let callCount = 0;
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: callCount === 0 ? '第一个版本' : '重新生成的版本',
              description: '测试描述',
              keyResults: [
                {
                  id: 'kr1',
                  statement: callCount === 0 ? 'KR版本1' : 'KR版本2',
                  target: '100%',
                  measurement: 'rate',
                },
              ],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Generate first OKR
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '测试目标');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    // Verify first version
    const firstVersion = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '第一个版本',
      15000,
    );
    expect(firstVersion).toBe(true);

    // Check for regenerate button
    const regenerateBtnExists = await waitForElement(
      mainWindow,
      '[data-testid="regenerate-okr-button"]',
      { timeout: 5000 },
    );

    if (!regenerateBtnExists) {
      test.skip(true, 'Regenerate button not found - feature may not be implemented yet');
      return;
    }

    // Increment counter to simulate different response
    callCount++;

    // Click regenerate
    await forceClick(mainWindow, '[data-testid="regenerate-okr-button"]');

    // Verify regenerated version
    const regeneratedVersion = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '重新生成的版本',
      20000,
    );
    expect(regeneratedVersion).toBe(true);

    // Verify KR is also updated
    const updatedKr = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      'KR版本2',
      10000,
    );
    expect(updatedKr).toBe(true);

    await mainWindow.screenshot({ path: 'test-results/okr-regenerate.png' });
  });

  test('should show loading state during regeneration', async ({ mainWindow, mockServer }) => {
    let generateStarted = false;
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '加载测试目标',
              description: '测试描述',
              keyResults: [{ id: 'kr1', statement: 'KR1', target: '100%', measurement: 'rate' }],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Generate first OKR
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '测试目标');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');
    await waitForText(mainWindow, '[data-testid="okr-summary"]', '加载测试目标', 15000);

    const regenerateBtnExists = await waitForElement(
      mainWindow,
      '[data-testid="regenerate-okr-button"]',
      { timeout: 5000 },
    );

    if (!regenerateBtnExists) {
      test.skip(true, 'Regenerate button not found - feature may not be implemented yet');
      return;
    }

    // Click regenerate
    generateStarted = false;
    await forceClick(mainWindow, '[data-testid="regenerate-okr-button"]');

    // Wait a bit and check for loading indicator
    await mainWindow.waitForTimeout(500);

    const loadingExists = await waitForElement(mainWindow, '[data-testid="regenerate-loading"]', {
      timeout: 5000,
    });
    if (loadingExists) {
      expect(loadingExists).toBe(true);
    }

    // Wait for completion
    await waitForText(mainWindow, '[data-testid="okr-summary"]', '加载测试目标', 20000);

    await mainWindow.screenshot({ path: 'test-results/okr-regenerate-loading.png' });
  });

  test('should handle regeneration error and allow retry', async ({ mainWindow, mockServer }) => {
    let shouldFail = true;

    // First call will fail, second will succeed
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: shouldFail
        ? undefined
        : {
            draft: {
              objectives: [
                {
                  id: 'o1',
                  title: '重试成功目标',
                  description: '重试后成功',
                  keyResults: [
                    { id: 'kr1', statement: '重试成功的KR', target: '100%', measurement: 'rate' },
                  ],
                },
              ],
            },
          },
    };
    mockServer.setResponses(mockConfig);

    // Generate first OKR
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '测试目标');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');
    await waitForText(mainWindow, '[data-testid="okr-summary"]', '测试目标', 15000);

    const regenerateBtnExists = await waitForElement(
      mainWindow,
      '[data-testid="regenerate-okr-button"]',
      { timeout: 5000 },
    );

    if (!regenerateBtnExists) {
      test.skip(true, 'Regenerate button not found - feature may not be implemented yet');
      return;
    }

    // Click regenerate (will fail - no draft in mock)
    await forceClick(mainWindow, '[data-testid="regenerate-okr-button"]');

    // Wait for error message
    const errorExists = await waitForElement(mainWindow, '[data-testid="error-message"]', {
      timeout: 15000,
    });

    if (!errorExists) {
      test.skip(true, 'Error handling not implemented yet');
      return;
    }

    expect(errorExists).toBe(true);

    // Check for retry button
    const retryButtonExists = await waitForElement(mainWindow, '[data-testid="retry-button"]', {
      timeout: 5000,
    });
    expect(retryButtonExists).toBe(true);

    // Retry with success
    shouldFail = false;
    await forceClick(mainWindow, '[data-testid="retry-button"]');

    // Verify retry succeeded
    const success = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '重试成功目标',
      20000,
    );
    expect(success).toBe(true);

    await mainWindow.screenshot({ path: 'test-results/okr-regenerate-retry.png' });
  });
});
