import { _electron as electron, expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(currentDir, '../../../..');
const MAIN_DIST = path.join(ROOT, 'app/main/dist/main.js');
const RENDERER_DIST = path.join(ROOT, 'app/renderer/dist/index.html');
const SESSION_PERSIST_PATH = path.join(ROOT, 'data', 'clarification-session.json');
const OKR_PERSIST_PATH = path.join(ROOT, 'data', 'okr-document.json');

function ensureBuildArtifacts(): void {
  const needsBuild = !existsSync(MAIN_DIST) || !existsSync(RENDERER_DIST);
  if (needsBuild) {
    execSync('pnpm run build', { cwd: ROOT, stdio: 'inherit' });
  }
}

test.beforeAll(() => {
  ensureBuildArtifacts();
});

test.beforeEach(async () => {
  const cleanupTargets = [SESSION_PERSIST_PATH, OKR_PERSIST_PATH];
  await Promise.all(
    cleanupTargets.map(async (target) => {
      if (existsSync(target)) {
        await fs.unlink(target);
      }
    })
  );
});

test('clarification interview completes and enables OKR generation', async () => {
  const electronApp = await electron.launch({ args: ['.'], cwd: ROOT });
  const childProcess = electronApp.process();
  childProcess.stderr?.on('data', (data) => {
    process.stderr.write(data);
  });
  childProcess.stdout?.on('data', (data) => {
    process.stdout.write(data);
  });

  const window = await electronApp.firstWindow();
  window.on('console', (message) => {
    // eslint-disable-next-line no-console
    console.info('[renderer]', message.type(), message.text());
  });
  await window.evaluate(() => {
    console.info('[renderer] console hook confirmation');
  });
  await window.waitForLoadState('domcontentloaded');

  await window.waitForSelector('[data-testid="intent-input"]');
  await window.fill('[data-testid="intent-input"]', '提高效率');
  const intentValue = await window.inputValue('[data-testid="intent-input"]');
  console.info('[e2e] intent input captured value:', intentValue);
  await expect(window.locator('[data-testid="start-clarification"]')).toBeEnabled();
  await window.click('[data-testid="start-clarification"]');

  // Wait for first clarification prompt to appear.
  try {
    await window.waitForSelector('[data-testid="clarification-option"]', { timeout: 15_000 });
  } catch (error) {
    const content = await window.content();
    // eslint-disable-next-line no-console
    console.error('[e2e] window content on failure:', content);
    throw error;
  }

  const optionLocator = window.locator('[data-testid="clarification-option"]');
  await optionLocator.first().click();

  // Wait for follow-up question to arrive and select an option.
  await window.waitForFunction(() => {
    const el = document.querySelector('[data-testid="prompt-question"]');
    return !!el && el.textContent?.includes('再补充');
  });
  await optionLocator.last().click();

  const generateButton = window.locator('[data-testid="clarification-generate"]');
  await expect(generateButton).toBeEnabled();
  await generateButton.click();

  const okrSummary = window.locator('[data-testid="okr-summary"]');
  await expect(okrSummary).toBeVisible();
  await expect(okrSummary).toContainText('提高效率');

  await electronApp.close();
});
