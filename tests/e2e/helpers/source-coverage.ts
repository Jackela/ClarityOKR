import type { ElectronApplication } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RENDERER_DIST } from './build-check';

/** Collect executed counters from all three real Electron worlds before fixture teardown. */
export async function collectSourceCoverage(
  app: ElectronApplication,
  output: string,
): Promise<void> {
  if (process.env.E2E_COVERAGE !== 'true') return;
  const coverage = await app.evaluate(async ({ BrowserWindow }, productUrl) => {
    const main = (globalThis as typeof globalThis & { __coverage__?: unknown }).__coverage__;
    const windows = await Promise.all(
      BrowserWindow.getAllWindows()
        .filter((window) => window.webContents.getURL().split(/[?#]/)[0] === productUrl)
        .map(async (window) => ({
          renderer: await window.webContents.executeJavaScript('globalThis.__coverage__ ?? {}'),
          preload: await window.webContents.executeJavaScriptInIsolatedWorld(999, [
            { code: 'globalThis.__coverage__ ?? {}' },
          ]),
        })),
    );
    return { main, windows };
  }, pathToFileURL(RENDERER_DIST).href);
  if (
    !coverage.main ||
    !Object.keys(coverage.main).length ||
    !coverage.windows.length ||
    coverage.windows.some(
      (window) => !Object.keys(window.renderer).length || !Object.keys(window.preload).length,
    )
  ) {
    throw new Error(
      'Instrumented E2E coverage missing main, renderer, or isolated preload counters',
    );
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(coverage));
}
