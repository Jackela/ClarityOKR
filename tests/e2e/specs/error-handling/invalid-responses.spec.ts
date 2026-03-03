import { test as base, expect } from '@playwright/test';
import { createMockServer, MockResponseConfig } from '../../fixtures/mock-server';
import { launchElectronApp, cleanupPersistenceFiles, ROOT } from '../../fixtures';

interface InvalidResponseFixture {
  mockServerCustom: {
    url: string;
    port: number;
    setResponses: (config: MockResponseConfig) => void;
  };
}

const test = base.extend<InvalidResponseFixture>({
  mockServerCustom: [
    async ({}, use, testInfo) => {
      const port = 7778 + testInfo.parallelIndex;
      const mockServer = createMockServer({ port });
      await mockServer.start();

      await use({
        url: mockServer.getUrl(),
        port: mockServer.getPort(),
        setResponses: mockServer.setResponses,
      });

      await mockServer.stop();
    },
    { scope: 'test' },
  ],
});

test.describe('Invalid LLM Response Handling', () => {
  test.beforeEach(async () => {
    await cleanupPersistenceFiles();
  });

  test('handles malformed JSON response gracefully', async ({ mockServerCustom }) => {
    mockServerCustom.setResponses({
      rawResponse: '{ invalid json }',
    });

    const { electronApp, mainWindow } = await launchElectronApp(mockServerCustom.url);

    await mainWindow.waitForLoadState('domcontentloaded');
    await mainWindow.fill('[data-testid="intent-input"]', '提高效率');
    await mainWindow.click('[data-testid="start-clarification"]');

    await mainWindow.waitForSelector('[data-testid="error-message"]', { timeout: 10000 });
    const errorElement = mainWindow.locator('[data-testid="error-message"]');
    await expect(errorElement).toBeVisible();

    const errorText = await errorElement.innerText();
    expect(errorText.toLowerCase()).toMatch(/(error|failed|invalid|malformed)/);

    await electronApp.close();
  });

  test('handles missing required fields gracefully', async ({ mockServerCustom }) => {
    mockServerCustom.setResponses({
      rawResponse: JSON.stringify({ question: { id: 'q1' } }),
    });

    const { electronApp, mainWindow } = await launchElectronApp(mockServerCustom.url);

    await mainWindow.waitForLoadState('domcontentloaded');
    await mainWindow.fill('[data-testid="intent-input"]', '提高效率');
    await mainWindow.click('[data-testid="start-clarification"]');

    await mainWindow.waitForSelector('[data-testid="error-message"]', { timeout: 10000 });
    const errorElement = mainWindow.locator('[data-testid="error-message"]');
    await expect(errorElement).toBeVisible();

    const errorText = await errorElement.innerText();
    expect(errorText.toLowerCase()).toMatch(/(error|failed|missing|invalid)/);

    await electronApp.close();
  });

  test('handles empty response gracefully', async ({ mockServerCustom }) => {
    mockServerCustom.setResponses({
      rawResponse: '',
    });

    const { electronApp, mainWindow } = await launchElectronApp(mockServerCustom.url);

    await mainWindow.waitForLoadState('domcontentloaded');
    await mainWindow.fill('[data-testid="intent-input"]', '提高效率');
    await mainWindow.click('[data-testid="start-clarification"]');

    await mainWindow.waitForSelector('[data-testid="error-message"]', { timeout: 10000 });
    const errorElement = mainWindow.locator('[data-testid="error-message"]');
    await expect(errorElement).toBeVisible();

    const errorText = await errorElement.innerText();
    expect(errorText.toLowerCase()).toMatch(/(error|failed|empty|no.*response)/);

    await electronApp.close();
  });
});
