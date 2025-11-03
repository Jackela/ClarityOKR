import { _electron as electron, expect, test } from '@playwright/test';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(currentDir, '../../../../');

function startMockLlmServer(port = 7777) {
  let counter = 0;
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url && req.url.includes('/v1/responses')) {
      // First two calls: next-question, last: OKR draft
      counter += 1;
      if (counter <= 2) {
        const body = JSON.stringify({
          question: {
            id: `q${counter + 1}`,
            text: '请选择下一步',
            options: [
              { id: 'a', label: 'A', value: 'a' },
              { id: 'b', label: 'B', value: 'b' }
            ]
          }
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(body);
        return;
      }
      const draft = JSON.stringify({
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '提高执行力',
              description: '自动生成',
              keyResults: [
                { id: 'kr1', statement: 'KR1', target: '10%', measurement: 'rate' },
                { id: 'kr2', statement: 'KR2', target: 5, measurement: 'count' },
                { id: 'kr3', statement: 'KR3', target: '2s', measurement: 'latency' }
              ]
            }
          ]
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(draft);
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise<http.Server>((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

test('LLM draft generation persists and displays OKR', async () => {
  const { execSync } = await import('node:child_process');
  execSync('pnpm run build', { cwd: ROOT, stdio: 'inherit' });
  const server = await startMockLlmServer();
  const electronApp = await electron.launch({ args: ['.'], cwd: ROOT, env: { ...process.env, LLM_API_KEY: 'test', LLM_BASE_URL: 'http://127.0.0.1:7777', LLM_MODEL: 'test' } });
  const window = await electronApp.firstWindow();

  await window.waitForLoadState('domcontentloaded');
  await window.fill('[data-testid="intent-input"]', '提高效率');
  await window.click('[data-testid="start-clarification"]');
  await window.waitForSelector('[data-testid="clarification-option"]');
  await window.locator('[data-testid="clarification-option"]').first().click();
  await window.waitForSelector('[data-testid="clarification-option"]');
  await window.locator('[data-testid="clarification-option"]').last().click();
  const generateButton = window.locator('[data-testid="clarification-generate"]');
  await expect(generateButton).toBeEnabled();
  await generateButton.click();

  const okrSummary = window.locator('[data-testid="okr-summary"]');
  await expect(okrSummary).toBeVisible();
  const summaryText = await okrSummary.innerText();
  expect(summaryText.includes('提高执行力') || summaryText.includes('提高效率')).toBeTruthy();

  await electronApp.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
