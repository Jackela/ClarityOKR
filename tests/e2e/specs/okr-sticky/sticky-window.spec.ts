import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import {
  ClarificationPage,
  OkrStickyPage,
  waitForStickyWindow,
  debugWindows,
} from '../../page-objects';
import { waitForElement, forceClick, waitForStateChange } from '../../helpers/native-dom';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

/**
 * E2E Test: Sticky Window Always-on-Top Behavior
 *
 * User Story 2 - Sticky OKR Visualization
 * Verifies that the sticky window stays always-on-top and displays OKR content correctly.
 */
test.describe('Sticky Window Always-on-Top Behavior', () => {
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

  test('sticky window stays on top when switching applications', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    // ==========================================
    // Step 1: Complete clarification flow
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

    // ==========================================
    // Step 2: Click "Generate OKR" to open sticky window
    // ==========================================
    const reopenBtnVisible = await waitForElement(mainWindow, '[data-testid="sticky-reopen"]', {
      timeout: 10000,
    });
    expect(reopenBtnVisible).toBe(true);

    await forceClick(mainWindow, '[data-testid="sticky-reopen"]');

    // ==========================================
    // Step 3: Verify sticky window opens
    // ==========================================
    let stickyWindowPage;
    try {
      stickyWindowPage = await waitForStickyWindow(electronApp, { timeout: 15000 });
    } catch (err) {
      await debugWindows(electronApp);
      const requestLog = mockServer.getRequestLog();
      // eslint-disable-next-line no-console
      console.error('[e2e] mock server request log:', JSON.stringify(requestLog, null, 2));
      throw err;
    }

    const stickyPage = new OkrStickyPage(stickyWindowPage);
    await stickyPage.waitForReady();

    // ==========================================
    // Step 4: Verify always-on-top behavior
    // ==========================================
    // Check window is always on top using Electron API
    const isAlwaysOnTop = await stickyPage.isAlwaysOnTop(electronApp);
    expect(isAlwaysOnTop).toBe(true);

    // Simulate switching to another window by creating a dummy window
    // and verifying sticky remains on top
    await electronApp.evaluate(({ BrowserWindow }) => {
      // Create a test window that would normally take focus
      const testWindow = new BrowserWindow({
        width: 400,
        height: 300,
        show: true,
        title: 'Test Focus Window',
      });

      // Try to focus it
      testWindow.focus();

      // Close after test
      setTimeout(() => testWindow.close(), 500);
    });

    // Wait for state stabilization after focus switch attempt
    await waitForStateChange(mainWindow, {
      to: '[data-testid="sticky-objective"]',
      timeout: 5000,
    });

    // Verify sticky window is still always on top after focus switch attempt
    const stillOnTop = await stickyPage.isAlwaysOnTop(electronApp);
    expect(stillOnTop).toBe(true);

    // Verify sticky window is still visible
    const isVisible = await stickyPage.isVisible();
    expect(isVisible).toBe(true);

    // ==========================================
    // Step 5: Verify hierarchical OKR display
    // ==========================================
    // Check objective is displayed
    const objective = await stickyPage.getObjective();
    expect(objective).toContain('提高团队开发效率');

    // Check key results are displayed
    const keyResults = await stickyPage.getKeyResults();
    expect(keyResults.length).toBe(3);

    // Verify hierarchical structure: each KR should have specific content
    expect(keyResults[0]).toContain('代码审查');
    expect(keyResults[1]).toContain('测试覆盖率');
    expect(keyResults[2]).toContain('发布频率');

    // ==========================================
    // Step 6: Verify window properties
    // ==========================================
    const windowInfo = await electronApp.evaluate(({ BrowserWindow }) => {
      const stickyWin = BrowserWindow.getAllWindows().find(
        (w) => w.isAlwaysOnTop() && w.getTitle().includes('Sticky'),
      );

      if (!stickyWin) return null;

      return {
        isAlwaysOnTop: stickyWin.isAlwaysOnTop(),
        isVisible: stickyWin.isVisible(),
        isFullScreenable: stickyWin.isFullScreenable(),
        isMinimizable: stickyWin.isMinimizable(),
        title: stickyWin.getTitle(),
      };
    });

    expect(windowInfo).not.toBeNull();
    expect(windowInfo?.isAlwaysOnTop).toBe(true);
    expect(windowInfo?.isVisible).toBe(true);
    expect(windowInfo?.title).toBe('ClarityOKR Sticky');
  });

  test('sticky window remains on top across multiple focus switches', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    // Complete clarification flow and open sticky window
    const clarification = new ClarificationPage(mainWindow);
    mockServer.setResponses(getMockConfig());

    await clarification.waitForReady();
    await clarification.completeClarificationFlow('提高团队开发效率', {
      questionCount: 2,
      selectOptionIndex: 0,
      finalOptionIndex: 1,
    });

    await clarification.waitForOkrSummary(30000);

    const reopenBtnVisible = await waitForElement(mainWindow, '[data-testid="sticky-reopen"]', {
      timeout: 10000,
    });
    expect(reopenBtnVisible).toBe(true);

    await forceClick(mainWindow, '[data-testid="sticky-reopen"]');

    const stickyWindowPage = await waitForStickyWindow(electronApp, { timeout: 15000 });
    const stickyPage = new OkrStickyPage(stickyWindowPage);
    await stickyPage.waitForReady();

    // Perform multiple focus switches
    for (let i = 0; i < 3; i++) {
      // Create a window and try to steal focus
      await electronApp.evaluate(({ BrowserWindow }) => {
        const testWindow = new BrowserWindow({
          width: 400,
          height: 300,
          show: true,
          alwaysOnTop: false,
        });
        testWindow.focus();
        setTimeout(() => testWindow.close(), 200);
      });

      // Wait for test window to close
      await waitForStateChange(mainWindow, {
        to: '[data-testid="sticky-objective"]',
        timeout: 3000,
      });

      // Verify sticky is still on top
      const onTop = await stickyPage.isAlwaysOnTop(electronApp);
      expect(onTop).toBe(true);
    }

    // Final verification of content
    const objective = await stickyPage.getObjective();
    expect(objective).toBeTruthy();

    const krCount = await stickyPage.getKeyResultCount();
    expect(krCount).toBeGreaterThan(0);
  });

  test('sticky window displays OKR hierarchy correctly', async ({
    electronApp,
    mainWindow,
    mockServer,
  }) => {
    // Complete clarification flow
    const clarification = new ClarificationPage(mainWindow);
    mockServer.setResponses(getMockConfig());

    await clarification.waitForReady();
    await clarification.completeClarificationFlow('提高团队开发效率', {
      questionCount: 2,
      selectOptionIndex: 0,
      finalOptionIndex: 1,
    });

    await clarification.waitForOkrSummary(30000);

    // Open sticky window
    await forceClick(mainWindow, '[data-testid="sticky-reopen"]');

    const stickyWindowPage = await waitForStickyWindow(electronApp, { timeout: 15000 });
    const stickyPage = new OkrStickyPage(stickyWindowPage);
    await stickyPage.waitForReady();

    // Verify OKR hierarchy
    const stickyInfo = await stickyPage.getStickyInfo();

    // Should have one objective
    expect(stickyInfo.objective).toContain('提高团队开发效率');

    // Should have 3 key results
    expect(stickyInfo.keyResultCount).toBe(3);

    // Each KR should have specific measurable content
    const krTexts = stickyInfo.keyResults.join(' ');
    expect(krTexts).toContain('代码审查');
    expect(krTexts).toContain('测试覆盖率');
    expect(krTexts).toContain('发布频率');
  });
});

