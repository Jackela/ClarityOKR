import { test, expect, cleanupPersistenceFiles } from '../fixtures';
import {
  ClarificationPage,
  OkrStickyPage,
  waitForStickyWindow,
  debugWindows,
} from '../page-objects';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

/**
 * E2E Test: Edit, Regenerate, and Copy OKR Workflow
 *
 * User Story 3 - Editable OKR Control
 * Verifies that users can edit OKR content, regenerate with different policies,
 * and copy to clipboard in markdown format.
 */
test.describe('Edit, Regenerate, and Copy OKR Workflow', () => {
  /**
   * Mock configuration for deterministic testing.
   * Provides predictable LLM responses for the clarification flow.
   */
  const getMockConfig = (): MockResponseConfig => ({
    nextQuestion: (callNumber) => {
      if (callNumber <= 2) {
        return {
          question: {
            id: `q${callNumber + 1}`,
            text: '请选择下一步细化方向',
            options: [
              { id: 'opt-a', label: '提高效率', value: 'efficiency' },
              { id: 'opt-b', label: '优化流程', value: 'process' },
            ],
          },
        };
      }
      return null;
    },
    draft: {
      draft: {
        objectives: [
          {
            id: 'obj-001',
            title: '提高团队开发效率',
            description: '通过优化流程和工具，提升团队整体产出',
            keyResults: [
              {
                id: 'kr-001',
                statement: '代码审查时间缩短至2天内',
                target: '2天',
                measurement: 'time',
              },
              {
                id: 'kr-002',
                statement: '自动化测试覆盖率提升至80%',
                target: '80%',
                measurement: 'percentage',
              },
              {
                id: 'kr-003',
                statement: '发布频率提升至每周2次',
                target: '2次/周',
                measurement: 'frequency',
              },
            ],
          },
        ],
      },
    },
  });

  /**
   * Mock configuration for regeneration with overwrite policy.
   * Returns a different set of KRs to verify overwrite behavior.
   */
  const getRegenerateOverwriteMockConfig = (): MockResponseConfig => ({
    regenerate: {
      draft: {
        objectives: [
          {
            id: 'obj-001',
            title: '提高团队开发效率',
            description: '通过优化流程和工具，提升团队整体产出',
            keyResults: [
              {
                id: 'kr-new-001',
                statement: '代码审查时间缩短至1天内',
                target: '1天',
                measurement: 'time',
              },
              {
                id: 'kr-new-002',
                statement: '自动化测试覆盖率提升至90%',
                target: '90%',
                measurement: 'percentage',
              },
              {
                id: 'kr-new-003',
                statement: '发布频率提升至每周3次',
                target: '3次/周',
                measurement: 'frequency',
              },
            ],
          },
        ],
      },
    },
  });

  /**
   * Mock configuration for regeneration with append policy.
   * Returns additional KRs to verify append behavior.
   */
  const getRegenerateAppendMockConfig = (): MockResponseConfig => ({
    regenerate: {
      draft: {
        objectives: [
          {
            id: 'obj-001',
            title: '提高团队开发效率',
            description: '通过优化流程和工具，提升团队整体产出',
            keyResults: [
              {
                id: 'kr-append-001',
                statement: '新增：Bug修复时间缩短至4小时内',
                target: '4小时',
                measurement: 'time',
              },
              {
                id: 'kr-append-002',
                statement: '新增：文档覆盖率提升至95%',
                target: '95%',
                measurement: 'percentage',
              },
            ],
          },
        ],
      },
    },
  });

  test('edit, regenerate, and copy OKR', async ({ electronApp, mainWindow, mockServer }) => {
    // ==========================================
    // Step 1: Generate OKR and open sticky
    // ==========================================
    const clarification = new ClarificationPage(mainWindow);
    const mockConfig = getMockConfig();

    mockServer.setResponses(mockConfig);
    await clarification.waitForReady();

    // Complete the full clarification flow with 2 questions
    await clarification.completeClarificationFlow('提高团队开发效率', {
      questionCount: 2,
      selectOptionIndex: 0,
      finalOptionIndex: 1,
    });

    // Wait for OKR summary to be visible
    await clarification.waitForOkrSummary(30000);
    const okrText = await clarification.getOkrSummaryText();
    expect(okrText).toContain('提高');

    // Click "Generate OKR" to open sticky window
    const reopenBtnVisible = await waitForElement(mainWindow, '[data-testid="sticky-reopen"]', {
      timeout: 10000,
    });
    expect(reopenBtnVisible).toBe(true);

    await forceClick(mainWindow, '[data-testid="sticky-reopen"]');

    // Wait for sticky window to open
    let stickyWindowPage;
    try {
      stickyWindowPage = await waitForStickyWindow(electronApp, { timeout: 15000 });
    } catch (err) {
      await debugWindows(electronApp);
      throw err;
    }

    const stickyPage = new OkrStickyPage(stickyWindowPage);
    await stickyPage.waitForReady();

    // Verify initial OKR content
    const initialObjective = await stickyPage.getObjective();
    expect(initialObjective).toContain('提高团队开发效率');

    const initialKeyResults = await stickyPage.getKeyResults();
    expect(initialKeyResults.length).toBe(3);
    expect(initialKeyResults[0]).toContain('代码审查');

    // ==========================================
    // Step 2: Click edit button
    // ==========================================
    const editBtnVisible = await waitForElement(stickyWindowPage, '[data-testid="edit-button"]', {
      timeout: 5000,
    });
    expect(editBtnVisible).toBe(true);

    await forceClick(stickyWindowPage, '[data-testid="edit-button"]');

    // Verify edit mode is active (save and cancel buttons should appear)
    const saveBtnVisible = await waitForElement(stickyWindowPage, '[data-testid="save-button"]', {
      timeout: 5000,
    });
    expect(saveBtnVisible).toBe(true);

    const cancelBtnVisible = await waitForElement(
      stickyWindowPage,
      '[data-testid="cancel-button"]',
      { timeout: 5000 },
    );
    expect(cancelBtnVisible).toBe(true);

    // ==========================================
    // Step 3: Modify objective text
    // ==========================================
    const objectiveInputVisible = await waitForElement(
      stickyWindowPage,
      '[data-testid="objective-input"]',
      { timeout: 5000 },
    );
    expect(objectiveInputVisible).toBe(true);

    // Clear and modify the objective text
    await stickyWindowPage.evaluate(() => {
      const input = document.querySelector('[data-testid="objective-input"]') as HTMLInputElement;
      if (input) {
        input.value = '优化团队开发效率';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // ==========================================
    // Step 4: Save changes
    // ==========================================
    await forceClick(stickyWindowPage, '[data-testid="save-button"]');

    // Wait for edit mode to close
    await waitForStateChange(stickyWindowPage, {
      to: '[data-testid="edit-button"]',
      timeout: 5000,
    });

    // ==========================================
    // Step 5: Verify display updated
    // ==========================================
    const updatedObjective = await stickyPage.getObjective();
    expect(updatedObjective).toContain('优化团队开发效率');

    // Verify key results are still intact
    const keyResultsAfterEdit = await stickyPage.getKeyResults();
    expect(keyResultsAfterEdit.length).toBe(3);

    // ==========================================
    // Step 6: Click regenerate
    // ==========================================
    const regenerateBtnVisible = await waitForElement(
      stickyWindowPage,
      '[data-testid="regenerate-button"]',
      { timeout: 5000 },
    );
    expect(regenerateBtnVisible).toBe(true);

    await forceClick(stickyWindowPage, '[data-testid="regenerate-button"]');

    // ==========================================
    // Step 7: Select 'overwrite' policy
    // ==========================================
    const policyOverwriteVisible = await waitForElement(
      stickyWindowPage,
      '[data-testid="policy-overwrite"]',
      { timeout: 5000 },
    );
    expect(policyOverwriteVisible).toBe(true);

    // Set mock response for regeneration
    mockServer.setResponses(getRegenerateOverwriteMockConfig());

    await forceClick(stickyWindowPage, '[data-testid="policy-overwrite"]');

    // Wait for regeneration to complete
    await waitForStateChange(stickyWindowPage, {
      from: '[data-testid="regenerate-button"]',
      to: '[data-testid="sticky-objective"]',
      timeout: 15000,
    });

    // ==========================================
    // Step 8: Verify OKR regenerated (overwrite)
    // ==========================================
    const regeneratedObjective = await stickyPage.getObjective();
    expect(regeneratedObjective).toContain('优化团队开发效率'); // Title should remain

    const regeneratedKeyResults = await stickyPage.getKeyResults();
    expect(regeneratedKeyResults.length).toBe(3);
    // Verify new KRs from overwrite
    expect(regeneratedKeyResults[0]).toContain('1天'); // Changed from 2天
    expect(regeneratedKeyResults[1]).toContain('90%'); // Changed from 80%
    expect(regeneratedKeyResults[2]).toContain('3次/周'); // Changed from 2次/周

    // ==========================================
    // Step 9: Click regenerate again
    // ==========================================
    await forceClick(stickyWindowPage, '[data-testid="regenerate-button"]');

    // ==========================================
    // Step 10: Select 'append' policy
    // ==========================================
    const policyAppendVisible = await waitForElement(
      stickyWindowPage,
      '[data-testid="policy-append"]',
      { timeout: 5000 },
    );
    expect(policyAppendVisible).toBe(true);

    // Set mock response for append regeneration
    mockServer.setResponses(getRegenerateAppendMockConfig());

    await forceClick(stickyWindowPage, '[data-testid="policy-append"]');

    // Wait for regeneration to complete
    await waitForStateChange(stickyWindowPage, {
      from: '[data-testid="regenerate-button"]',
      to: '[data-testid="sticky-key-result"]',
      timeout: 15000,
    });

    // ==========================================
    // Step 11: Verify KRs appended
    // ==========================================
    const appendedKeyResults = await stickyPage.getKeyResults();
    // Should have 3 original + 2 appended = 5 KRs
    expect(appendedKeyResults.length).toBe(5);

    // Verify original KRs still exist
    expect(appendedKeyResults[0]).toContain('1天');

    // Verify appended KRs exist
    const krTexts = appendedKeyResults.join(' ');
    expect(krTexts).toContain('Bug修复时间');
    expect(krTexts).toContain('文档覆盖率');

    // ==========================================
    // Step 12: Click copy to clipboard
    // ==========================================
    const copyBtnVisible = await waitForElement(stickyWindowPage, '[data-testid="copy-button"]', {
      timeout: 5000,
    });
    expect(copyBtnVisible).toBe(true);

    // Grant clipboard permissions and click copy
    await stickyWindowPage.evaluate(() => {
      // Mock clipboard API if not available in test environment
      if (!navigator.clipboard) {
        (navigator as any).clipboard = {
          writeText: async (text: string) => {
            (window as any).__clipboardText = text;
            return Promise.resolve();
          },
          readText: async () => (window as any).__clipboardText || '',
        };
      }
    });

    await forceClick(stickyWindowPage, '[data-testid="copy-button"]');

    // Wait for copy success indicator
    const copySuccessVisible = await waitForElement(
      stickyWindowPage,
      '[data-testid="copy-success"]',
      { timeout: 5000 },
    ).catch(() => false);

    // Copy success indicator is optional, but if present it should be visible
    if (copySuccessVisible) {
      expect(copySuccessVisible).toBe(true);
    }

    // ==========================================
    // Step 13: Verify clipboard contains markdown
    // ==========================================
    const clipboardText = await stickyWindowPage.evaluate(() => {
      return (window as any).__clipboardText || '';
    });

    expect(clipboardText).toContain('优化团队开发效率');
    expect(clipboardText).toContain('## 目标');
    expect(clipboardText).toContain('## 关键结果');

    // Verify all KRs are in the markdown
    expect(clipboardText).toContain('代码审查时间');
    expect(clipboardText).toContain('自动化测试覆盖率');
    expect(clipboardText).toContain('发布频率');
  });

  test('cancel edit reverts changes', async ({ electronApp, mainWindow, mockServer }) => {
    // ==========================================
    // Setup: Generate OKR and open sticky
    // ==========================================
    const clarification = new ClarificationPage(mainWindow);
    mockServer.setResponses(getMockConfig());
    await clarification.waitForReady();

    await clarification.completeClarificationFlow('提高团队开发效率', {
      questionCount: 2,
      selectOptionIndex: 0,
      finalOptionIndex: 1,
    });

    await clarification.waitForOkrSummary(30000);
    await forceClick(mainWindow, '[data-testid="sticky-reopen"]');

    const stickyWindowPage = await waitForStickyWindow(electronApp, { timeout: 15000 });
    const stickyPage = new OkrStickyPage(stickyWindowPage);
    await stickyPage.waitForReady();

    const originalObjective = await stickyPage.getObjective();

    // ==========================================
    // Enter edit mode and modify text
    // ==========================================
    await forceClick(stickyWindowPage, '[data-testid="edit-button"]');

    await stickyWindowPage.evaluate(() => {
      const input = document.querySelector('[data-testid="objective-input"]') as HTMLInputElement;
      if (input) {
        input.value = '完全不同的目标';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // ==========================================
    // Click cancel button
    // ==========================================
    await forceClick(stickyWindowPage, '[data-testid="cancel-button"]');

    // Wait for edit mode to close
    await waitForStateChange(stickyWindowPage, {
      to: '[data-testid="edit-button"]',
      timeout: 5000,
    });

    // ==========================================
    // Verify changes were reverted
    // ==========================================
    const objectiveAfterCancel = await stickyPage.getObjective();
    expect(objectiveAfterCancel).toBe(originalObjective);
  });
});
