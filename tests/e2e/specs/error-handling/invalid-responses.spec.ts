import { _electron as electron, expect, test } from '@playwright/test';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(currentDir, '../../../../');

function startMockLlmServer(port: number, responseMode: 'malformed' | 'missing-fields' | 'empty') {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url && req.url.includes('/v1/responses')) {
      if (responseMode === 'malformed') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{ invalid json }');
        return;
      }

      if (responseMode === 'missing-fields') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ question: { id: 'q1' } }));
        return;
      }

      if (responseMode === 'empty') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('');
        return;
      }
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise<http.Server>((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

test.describe('Invalid LLM Response Handling', () => {
  test('handles malformed JSON response gracefully', async () => {
    const { execSync } = await import('node:child_process');
    execSync('pnpm run build', { cwd: ROOT, stdio: 'inherit' });

    const server = await startMockLlmServer(7778, 'malformed');
    const electronApp = await electron.launch({
      args: ['.', ...extraElectronArgs()],
      cwd: ROOT,
      env: {
        ...process.env,
        LLM_API_KEY: 'test',
        LLM_BASE_URL: 'http://127.0.0.1:7778',
        LLM_MODEL: 'test',
      },
    });

    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.fill('[data-testid="intent-input"]', '提高效率');
    await window.click('[data-testid="start-clarification"]');

    await window.waitForSelector('[data-testid="clarification-error"]', { timeout: 10000 });
    const errorElement = window.locator('[data-testid="clarification-error"]');
    await expect(errorElement).toBeVisible();

    const errorText = await errorElement.innerText();
    expect(errorText.toLowerCase()).toMatch(/(error|failed|invalid|malformed)/);

    await electronApp.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('handles missing required fields gracefully', async () => {
    const { execSync } = await import('node:child_process');
    execSync('pnpm run build', { cwd: ROOT, stdio: 'inherit' });

    const server = await startMockLlmServer(7779, 'missing-fields');
    const electronApp = await electron.launch({
      args: ['.', ...extraElectronArgs()],
      cwd: ROOT,
      env: {
        ...process.env,
        LLM_API_KEY: 'test',
        LLM_BASE_URL: 'http://127.0.0.1:7779',
        LLM_MODEL: 'test',
      },
    });

    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.fill('[data-testid="intent-input"]', '提高效率');
    await window.click('[data-testid="start-clarification"]');

    await window.waitForSelector('[data-testid="clarification-error"]', { timeout: 10000 });
    const errorElement = window.locator('[data-testid="clarification-error"]');
    await expect(errorElement).toBeVisible();

    const errorText = await errorElement.innerText();
    expect(errorText.toLowerCase()).toMatch(/(error|failed|missing|invalid)/);

    await electronApp.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('handles empty response gracefully', async () => {
    const { execSync } = await import('node:child_process');
    execSync('pnpm run build', { cwd: ROOT, stdio: 'inherit' });

    const server = await startMockLlmServer(7780, 'empty');
    const electronApp = await electron.launch({
      args: ['.', ...extraElectronArgs()],
      cwd: ROOT,
      env: {
        ...process.env,
        LLM_API_KEY: 'test',
        LLM_BASE_URL: 'http://127.0.0.1:7780',
        LLM_MODEL: 'test',
      },
    });

    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.fill('[data-testid="intent-input"]', '提高效率');
    await window.click('[data-testid="start-clarification"]');

    await window.waitForSelector('[data-testid="clarification-error"]', { timeout: 10000 });
    const errorElement = window.locator('[data-testid="clarification-error"]');
    await expect(errorElement).toBeVisible();

    const errorText = await errorElement.innerText();
    expect(errorText.toLowerCase()).toMatch(/(error|failed|empty|no.*response)/);

    await electronApp.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

function extraElectronArgs(): string[] {
  const raw = process.env.ELECTRON_EXTRA_LAUNCH_ARGS || '';
  return raw.trim() ? raw.trim().split(/\s+/) : [];
}
