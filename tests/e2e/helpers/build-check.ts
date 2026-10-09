import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElectronApplication, Page } from '@playwright/test';
import { _electron } from '@playwright/test';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(currentDir, '../../../');
const output = process.env.E2E_COVERAGE === 'true' ? 'dist-coverage' : 'dist';
export const MAIN_DIST = path.join(ROOT, `app/main/${output}/main.js`);
export const RENDERER_DIST = path.join(
  ROOT,
  `app/renderer/${output}`,
  ...(process.env.E2E_COVERAGE === 'true' ? ['browser'] : []),
  'index.html',
);
export const SESSION_PERSIST_PATH = path.join(ROOT, 'data', 'clarification-session.json');
export const OKR_PERSIST_PATH = path.join(ROOT, 'data', 'okr-document.json');

let buildChecked = false;

export function ensureBuildArtifacts(): void {
  if (buildChecked) {
    return;
  }

  const needsBuild = !existsSync(MAIN_DIST) || !existsSync(RENDERER_DIST);
  if (needsBuild && process.env.E2E_COVERAGE === 'true') {
    throw new Error('Run build:coverage before instrumented Electron tests');
  }
  if (needsBuild) {
    // eslint-disable-next-line no-console
    console.log('[build-check] Building project...');
    execSync('pnpm run build', { cwd: ROOT, stdio: 'inherit' });
  } else {
    // eslint-disable-next-line no-console
    console.log('[build-check] Build artifacts already exist, skipping build');
  }
  buildChecked = true;
}

export function extraElectronArgs(): string[] {
  const raw = process.env.ELECTRON_EXTRA_LAUNCH_ARGS || '';
  return raw.trim() ? raw.trim().split(/\s+/) : [];
}

export function getElectronEnv(mockServerUrl: string): { [key: string]: string } {
  return {
    ...process.env,
    E2E_TEST: '1',
    ...(process.env.E2E_COVERAGE === 'true'
      ? { E2E_RENDERER_DIR: path.dirname(RENDERER_DIST) }
      : {}),
    LLM_API_KEY: 'test',
    LLM_BASE_URL: mockServerUrl,
    LLM_MODEL: 'test',
  } as { [key: string]: string };
}

export async function launchElectronApp(
  mockServerUrl: string,
): Promise<{ electronApp: ElectronApplication; mainWindow: Page }> {
  ensureBuildArtifacts();

  const electronApp = await _electron.launch({
    args: [MAIN_DIST, ...extraElectronArgs()],
    cwd: ROOT,
    env: getElectronEnv(mockServerUrl),
  });

  const childProcess = electronApp.process();
  childProcess.stderr?.on('data', (data) => process.stderr.write(data));
  childProcess.stdout?.on('data', (data) => process.stdout.write(data));

  const mainWindow = await electronApp.firstWindow({ timeout: 60_000 });

  mainWindow.on('console', (message) => {
    console.info('[renderer]', message.type(), message.text());
  });

  await mainWindow.evaluate(() => {
    console.info('[renderer] console hook confirmation');
  });
  await mainWindow.waitForLoadState('domcontentloaded');

  return { electronApp, mainWindow };
}

export async function findStickyWindow(electronApp: ElectronApplication): Promise<Page | null> {
  // Use Electron API to find always-on-top windows
  const stickyWindowId = await electronApp.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    const sticky = windows.find((w) => w.isAlwaysOnTop() && w.isVisible());
    return sticky ? sticky.id : null;
  });

  if (!stickyWindowId) return null;

  // Find corresponding Playwright page by checking all pages
  const pages = electronApp.context().pages();
  for (const page of pages) {
    // Try to identify the sticky window by checking if it's not the main window
    // and by looking at window properties
    const isSticky = await page
      .evaluate(() => {
        // Check if this is a sticky window by looking for sticky-specific attributes
        const body = document.body;
        return (
          body.hasAttribute('data-sticky-window') ||
          document.title.includes('Sticky') ||
          window.location.href.includes('sticky')
        );
      })
      .catch(() => false);

    if (isSticky) {
      return page;
    }
  }

  // If we can't identify by attributes, return the last page (usually the newest window)
  // This is a fallback approach
  if (pages.length > 1) {
    return pages[pages.length - 1];
  }

  return null;
}
