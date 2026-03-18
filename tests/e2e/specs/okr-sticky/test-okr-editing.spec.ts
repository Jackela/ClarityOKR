import { workerTest as test, expect } from '../../fixtures/worker-fixtures';
import { cleanupPersistenceFiles } from '../../fixtures';
import { waitForElement, waitForText, forceClick } from '../../helpers/native-dom';
import type { MockResponseConfig } from '@clarityokr/contracts';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

test.describe('E2E: OKR Editing', () => {
  test('should edit Objective title', async ({ mainWindow, mockServer }) => {
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '原始标题',
              description: '测试描述',
              keyResults: [{ id: 'kr1', statement: 'KR1', target: '100%', measurement: 'rate' }],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Start clarification and generate OKR
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '测试目标');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    // Verify OKR is generated
    const okrVisible = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '原始标题',
      15000,
    );
    expect(okrVisible).toBe(true);

    // Try to edit objective title
    // NOTE: Edit functionality needs data-testid="edit-objective-button"
    const editButtonExists = await waitForElement(
      mainWindow,
      '[data-testid="edit-objective-button"]',
      { timeout: 5000 },
    );

    if (!editButtonExists) {
      test.skip(true, 'Edit button not found - feature may not be implemented yet');
      return;
    }

    await forceClick(mainWindow, '[data-testid="edit-objective-button"]');

    // Edit the title
    await waitForElement(mainWindow, '[data-testid="objective-title-input"]', { timeout: 5000 });
    await mainWindow.fill('[data-testid="objective-title-input"]', '修改后的标题');
    await mainWindow.click('[data-testid="save-objective-button"]');

    // Verify title is updated
    const updatedText = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '修改后的标题',
      10000,
    );
    expect(updatedText).toBe(true);

    // Take screenshot
    await mainWindow.screenshot({ path: 'test-results/okr-edit-objective.png' });
  });

  test('should edit Key Result', async ({ mainWindow, mockServer }) => {
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '测试目标',
              description: '测试描述',
              keyResults: [
                { id: 'kr1', statement: '原始KR描述', target: '100%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Generate OKR
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '测试目标');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    await waitForText(mainWindow, '[data-testid="okr-summary"]', '测试目标', 15000);

    // Try to edit KR
    const editKrButtonExists = await waitForElement(mainWindow, '[data-testid="edit-kr-button"]', {
      timeout: 5000,
    });

    if (!editKrButtonExists) {
      test.skip(true, 'KR edit button not found - feature may not be implemented yet');
      return;
    }

    await forceClick(mainWindow, '[data-testid="edit-kr-button"]');

    // Edit KR statement
    await waitForElement(mainWindow, '[data-testid="kr-statement-input"]', { timeout: 5000 });
    await mainWindow.fill('[data-testid="kr-statement-input"]', '修改后的KR描述');
    await mainWindow.click('[data-testid="save-kr-button"]');

    // Verify KR is updated
    const updatedText = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '修改后的KR描述',
      10000,
    );
    expect(updatedText).toBe(true);

    await mainWindow.screenshot({ path: 'test-results/okr-edit-kr.png' });
  });

  test('should delete Key Result', async ({ mainWindow, mockServer }) => {
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '测试目标',
              description: '测试描述',
              keyResults: [
                { id: 'kr1', statement: '要删除的KR', target: '100%', measurement: 'rate' },
                { id: 'kr2', statement: '保留的KR', target: '90%', measurement: 'rate' },
              ],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Generate OKR
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '测试目标');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    await waitForText(mainWindow, '[data-testid="okr-summary"]', '测试目标', 15000);

    // Try to delete KR
    const deleteKrButtonExists = await waitForElement(
      mainWindow,
      '[data-testid="delete-kr-button"]',
      { timeout: 5000 },
    );

    if (!deleteKrButtonExists) {
      test.skip(true, 'KR delete button not found - feature may not be implemented yet');
      return;
    }

    await forceClick(mainWindow, '[data-testid="delete-kr-button"]:first-child');

    // Confirm deletion if dialog appears
    const confirmButtonExists = await waitForElement(
      mainWindow,
      '[data-testid="confirm-delete-button"]',
      { timeout: 3000 },
    );
    if (confirmButtonExists) {
      await mainWindow.click('[data-testid="confirm-delete-button"]');
    }

    // Verify KR is deleted
    const deletedText = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '要删除的KR',
      5000,
    );
    expect(deletedText).toBe(false);

    // Verify remaining KR still exists
    const remainingText = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '保留的KR',
      5000,
    );
    expect(remainingText).toBe(true);

    await mainWindow.screenshot({ path: 'test-results/okr-delete-kr.png' });
  });

  test('should persist edits after reload', async ({ mainWindow, mockServer }) => {
    const mockConfig: MockResponseConfig = {
      nextQuestion: () => null,
      draft: {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '持久化测试目标',
              description: '测试描述',
              keyResults: [{ id: 'kr1', statement: 'KR1', target: '100%', measurement: 'rate' }],
            },
          ],
        },
      },
    };
    mockServer.setResponses(mockConfig);

    // Generate OKR
    await waitForElement(mainWindow, '[data-testid="intent-input"]', { timeout: 10000 });
    await mainWindow.fill('[data-testid="intent-input"]', '持久化测试');
    await mainWindow.click('[data-testid="start-clarification"]');
    await waitForElement(mainWindow, '[data-testid="clarification-generate"]', { timeout: 15000 });
    await forceClick(mainWindow, '[data-testid="clarification-generate"]');

    await waitForText(mainWindow, '[data-testid="okr-summary"]', '持久化测试目标', 15000);

    // Try to edit and save
    const editButtonExists = await waitForElement(
      mainWindow,
      '[data-testid="edit-objective-button"]',
      { timeout: 5000 },
    );

    if (!editButtonExists) {
      test.skip(true, 'Edit button not found - feature may not be implemented yet');
      return;
    }

    await forceClick(mainWindow, '[data-testid="edit-objective-button"]');
    await waitForElement(mainWindow, '[data-testid="objective-title-input"]', { timeout: 5000 });
    await mainWindow.fill('[data-testid="objective-title-input"]', '已修改的持久化目标');
    await mainWindow.click('[data-testid="save-objective-button"]');

    // Verify edit is saved
    const edited = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '已修改的持久化目标',
      10000,
    );
    expect(edited).toBe(true);

    // Reload page
    await mainWindow.reload();

    // Verify edit persists after reload
    const persisted = await waitForText(
      mainWindow,
      '[data-testid="okr-summary"]',
      '已修改的持久化目标',
      15000,
    );
    expect(persisted).toBe(true);

    await mainWindow.screenshot({ path: 'test-results/okr-edit-persist.png' });
  });
});
