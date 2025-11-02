#!/usr/bin/env node
/*
 * Cross-platform component test runner.
 * - Resolves Playwright's Chromium path and sets CHROME_BIN
 * - Executes: pnpm --filter @clarityokr/renderer run test
 */
const { spawnSync } = require('node:child_process');

function getChromiumPath() {
  try {
    const { chromium } = require('@playwright/test');
    const p = chromium.executablePath();
    if (!p || typeof p !== 'string') throw new Error('chromium.executablePath() returned empty');
    return p;
  } catch (err) {
    console.error('[component-tests] Failed to resolve Playwright Chromium path:', err);
    process.exit(1);
  }
}

function run() {
  const env = { ...process.env };
  env.CHROME_BIN = env.CHROME_BIN || getChromiumPath();
  const args = ['--filter', '@clarityokr/renderer', 'run', 'test'];
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  process.exit(result.status ?? 1);
}

run();

