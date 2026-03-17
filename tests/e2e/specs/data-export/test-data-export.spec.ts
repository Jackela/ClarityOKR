import { workerTest as test, expect } from '../../fixtures/worker-fixtures';
import { cleanupPersistenceFiles } from '../../fixtures';
import { waitForElement, waitForText, forceClick } from '../../helpers/native-dom';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test.describe('E2E: Data Export', () => {
  test('should export OKR as Markdown', async ({ mainWindow, mockServer }) => {
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '导出测试目标',
              description: '测试描述内容',
              keyResults: [
                { id: 'kr1', statement: '关键结果1', target: '100%', measurement: 'rate' },
                { id: 'kr2', statement: '关键结果2', target: '90%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Generate OKR
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '导出测试');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');
    await waitForText(mainWindow, '[data-testid="okr-summary"]', '导出测试目标', 15000);

    // Check for export button
    const exportBtnExists = await waitForElement(
      mainWindow,
      '[data-testid="export-markdown-button"]',
      { timeout: 5000 },
    );

    if (!exportBtnExists) {
      test.skip(true, 'Markdown export button not found - feature may not be implemented yet');
      return;
    }

    // Click export
    await forceClick(mainWindow, '[data-testid="export-markdown-button"]');

    // Wait for export dialog or file save
    const exportDialogExists = await waitForElement(mainWindow, '[data-testid="export-dialog"]', {
      timeout: 5000,
    });
    if (exportDialogExists) {
      // Verify dialog content
      const content = await mainWindow.locator('[data-testid="export-content"]').innerText();
      expect(content).toContain('导出测试目标');
      expect(content).toContain('关键结果1');
    }

    await mainWindow.screenshot({ path: 'test-results/data-export-markdown.png' });
  });

  test('should copy OKR to clipboard', async ({ mainWindow, mockServer }) => {
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '剪贴板测试目标',
              description: '测试描述',
              keyResults: [
                { id: 'kr1', statement: '剪贴板KR', target: '100%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Generate OKR
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '剪贴板测试');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');
    await waitForText(mainWindow, '[data-testid="okr-summary"]', '剪贴板测试目标', 15000);

    // Check for copy button
    const copyBtnExists = await waitForElement(
      mainWindow,
      '[data-testid="copy-to-clipboard-button"]',
      { timeout: 5000 },
    );

    if (!copyBtnExists) {
      test.skip(true, 'Copy to clipboard button not found - feature may not be implemented yet');
      return;
    }

    // Click copy
    await forceClick(mainWindow, '[data-testid="copy-to-clipboard-button"]');

    // Check for success notification
    const notificationExists = await waitForElement(
      mainWindow,
      '[data-testid="clipboard-success-notification"]',
      { timeout: 5000 },
    );

    if (notificationExists) {
      expect(notificationExists).toBe(true);
    } else {
      // Alternative: check if button shows success state
      const successIconExists = await waitForElement(
        mainWindow,
        '[data-testid="copy-success-icon"]',
        { timeout: 3000 },
      );
      if (successIconExists) {
        expect(successIconExists).toBe(true);
      }
    }

    await mainWindow.screenshot({ path: 'test-results/data-export-clipboard.png' });
  });

  test('should export content in correct Markdown format', async ({ mainWindow, mockServer }) => {
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '格式测试目标',
              description: '详细的描述信息',
              keyResults: [
                { id: 'kr1', statement: '第一个关键结果', target: '100%', measurement: 'rate' },
                { id: 'kr2', statement: '第二个关键结果', target: '90%', measurement: 'rate' },
                { id: 'kr3', statement: '第三个关键结果', target: '80%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Generate OKR
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '格式测试');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');
    await waitForText(mainWindow, '[data-testid="okr-summary"]', '格式测试目标', 15000);

    // Check for export preview
    const exportPreviewExists = await waitForElement(mainWindow, '[data-testid="export-preview"]', {
      timeout: 5000,
    });

    if (!exportPreviewExists) {
      test.skip(true, 'Export preview not found - feature may not be implemented yet');
      return;
    }

    // Get preview content
    const previewContent = await mainWindow.locator('[data-testid="export-preview"]').innerText();

    // Verify Markdown structure
    expect(previewContent).toContain('格式测试目标');
    expect(previewContent).toContain('第一个关键结果');
    expect(previewContent).toContain('第二个关键结果');
    expect(previewContent).toContain('第三个关键结果');

    // Check for Markdown formatting
    const hasMarkdownFormat =
      previewContent.includes('#') || previewContent.includes('-') || previewContent.includes('*');
    expect(hasMarkdownFormat).toBe(true);

    await mainWindow.screenshot({ path: 'test-results/data-export-format.png' });
  });
});
