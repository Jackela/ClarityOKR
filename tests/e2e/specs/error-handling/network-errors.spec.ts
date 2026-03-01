import { _electron as electron, expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import http from 'node:http';
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

function startFailingServer(port = 7777) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url && req.url.includes('/v1/responses')) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service Unavailable' }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise<http.Server>((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

function startRecoveryServer(port = 7777, failFirst = 1) {
  let counter = 0;
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url && req.url.includes('/v1/responses')) {
      counter += 1;
      if (counter <= failFirst) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service Unavailable' }));
        return;
      }
      const body = JSON.stringify({
        question: {
          id: 'q1',
          text: 'Test question',
          options: [
            { id: 'a', label: 'Option A', value: 'a' },
            { id: 'b', label: 'Option B', value: 'b' },
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

function extraElectronArgs(): string[] {
  const raw = process.env.ELECTRON_EXTRA_LAUNCH_ARGS || '';
  return raw.trim() ? raw.trim().split(/\s+/) : [];
}

test.beforeAll(() => {
  execSync('pnpm run build', { cwd: ROOT, stdio: 'inherit' });
});

test.beforeEach(async () => {
  const cleanupTargets = [SESSION_PERSIST_PATH, OKR_PERSIST_PATH];
  await Promise.all(
    cleanupTargets.map(async (target) => {
      if (existsSync(target)) {
        await fs.unlink(target);
      }
    }),
  );
});

test('shows error message when LLM API is unreachable', async () => {
  const server = await startFailingServer();
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
  const childProcess = electronApp.process();
  childProcess.stderr?.on('data', (data) => {
    process.stderr.write(data);
  });
  childProcess.stdout?.on('data', (data) => {
    process.stdout.write(data);
  });

  const window = await electronApp.firstWindow();
  window.on('console', (message) => {
    console.info('[renderer]', message.type(), message.text());
  });
  await window.waitForLoadState('domcontentloaded');

  await window.waitForSelector('[data-testid="intent-input"]');
  await window.fill('[data-testid="intent-input"]', 'Test network error');
  await expect(window.locator('[data-testid="start-clarification"]')).toBeEnabled();
  await window.click('[data-testid="start-clarification"]');

  await window.waitForSelector('[data-testid="error-message"]', { timeout: 10_000 });
  const errorElement = window.locator('[data-testid="error-message"]');
  await expect(errorElement).toBeVisible();
  await expect(errorElement).toContainText(/unavailable|error|failed/i);

  await electronApp.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('shows retry button when network error occurs', async () => {
  const server = await startFailingServer();
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
  const childProcess = electronApp.process();
  childProcess.stderr?.on('data', (data) => {
    process.stderr.write(data);
  });
  childProcess.stdout?.on('data', (data) => {
    process.stdout.write(data);
  });

  const window = await electronApp.firstWindow();
  window.on('console', (message) => {
    console.info('[renderer]', message.type(), message.text());
  });
  await window.waitForLoadState('domcontentloaded');

  await window.waitForSelector('[data-testid="intent-input"]');
  await window.fill('[data-testid="intent-input"]', 'Test retry button');
  await expect(window.locator('[data-testid="start-clarification"]')).toBeEnabled();
  await window.click('[data-testid="start-clarification"]');

  await window.waitForSelector('[data-testid="error-message"]', { timeout: 10_000 });
  const retryButton = window.locator('[data-testid="retry-button"]');
  await expect(retryButton).toBeVisible();
  await expect(retryButton).toBeEnabled();

  await electronApp.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('recovers when retry succeeds after initial network failure', async () => {
  const server = await startRecoveryServer(7777, 1);
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
  const childProcess = electronApp.process();
  childProcess.stderr?.on('data', (data) => {
    process.stderr.write(data);
  });
  childProcess.stdout?.on('data', (data) => {
    process.stdout.write(data);
  });

  const window = await electronApp.firstWindow();
  window.on('console', (message) => {
    console.info('[renderer]', message.type(), message.text());
  });
  await window.waitForLoadState('domcontentloaded');

  await window.waitForSelector('[data-testid="intent-input"]');
  await window.fill('[data-testid="intent-input"]', 'Test retry recovery');
  await expect(window.locator('[data-testid="start-clarification"]')).toBeEnabled();
  await window.click('[data-testid="start-clarification"]');

  await window.waitForSelector('[data-testid="error-message"]', { timeout: 10_000 });
  const retryButton = window.locator('[data-testid="retry-button"]');
  await expect(retryButton).toBeEnabled();
  await retryButton.click();

  await window.waitForSelector('[data-testid="clarification-option"]', { timeout: 10_000 });
  const optionLocator = window.locator('[data-testid="clarification-option"]');
  await expect(optionLocator.first()).toBeVisible();

  await electronApp.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
