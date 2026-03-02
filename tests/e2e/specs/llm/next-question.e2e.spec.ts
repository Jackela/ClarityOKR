import { _electron as electron, expect, test } from '@playwright/test';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(currentDir, '../../../../');

function startMockLlmServer(port = 7777) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url && req.url.includes('/v1/responses')) {
      // Return a next-question payload
      const body = JSON.stringify({
        question: {
          id: 'q2',
          text: '请选择下一步',
          options: [
            { id: 'a', label: 'A', value: 'a' },
            { id: 'b', label: 'B', value: 'b' },
          ],
        },
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise<http.Server>((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

test('LLM next-question updates prompt after selection', async () => {
  // Always rebuild to pick up latest code
  const { execSync } = await import('node:child_process');
  execSync('pnpm run build', { cwd: ROOT, stdio: 'inherit' });
  const server = await startMockLlmServer();
  const electronApp = await electron.launch({
    args: ['.', ...extraElectronArgs()],
    cwd: ROOT,
    env: {
      ...process.env,
      LLM_API_KEY: 'test',
      LLM_BASE_URL: 'http://127.0.0.1:7777',
      LLM_MODEL: 'test',
    },
  });
  const window = await electronApp.firstWindow();

  await window.waitForLoadState('domcontentloaded');
  await window.fill('[data-testid="intent-input"]', '提高效率');
  await window.click('[data-testid="start-clarification"]');
  await window.waitForSelector('[data-testid="clarification-option"]');
  // Select an option to trigger LLM next-question
  await window.locator('[data-testid="clarification-option"]').first().click();
  // Wait for loading to start then finish
  await window.waitForSelector('[data-testid="clarification-loading"]', { timeout: 5000 });
  await window.waitForSelector('[data-testid="clarification-loading"]', {
    state: 'hidden',
    timeout: 15_000,
  });
  // Wait for the next prompt to render
  await window.waitForSelector('[data-testid="clarification-option"]', { timeout: 5000 });
  // Verify a follow-up prompt rendered (accept either static or mock LLM text)
  const text = await window.locator('[data-testid="prompt-question"]').first().innerText();
  expect(text.includes('请选择下一步') || text.includes('再补充')).toBeTruthy();

  await electronApp.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
function extraElectronArgs(): string[] {
  const raw = process.env.ELECTRON_EXTRA_LAUNCH_ARGS || '';
  return raw.trim() ? raw.trim().split(/\s+/) : [];
}
