import { ElectronApplication, Page } from '@playwright/test';
import * as os from 'os';

export interface DiagnosticsInfo {
  timestamp: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  cpus: number;
  totalMemory: string;
  freeMemory: string;
  environment: Record<string, string | undefined>;
  electronArgs: string[];
  xvfbDisplay: string | undefined;
}

export async function collectDiagnostics(): Promise<DiagnosticsInfo> {
  return {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)}MB`,
    freeMemory: `${Math.round(os.freemem() / 1024 / 1024)}MB`,
    environment: {
      CI: process.env.CI,
      GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
      DISPLAY: process.env.DISPLAY,
      XVFB_DISPLAY: process.env.XVFB_DISPLAY,
      ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING,
      DEBUG: process.env.DEBUG,
    },
    electronArgs: getElectronArgs(),
    xvfbDisplay: process.env.DISPLAY,
  };
}

export function getElectronArgs(): string[] {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process', // 如果适用
    '--disable-extensions',
  ];

  if (process.env.CI) {
    args.push('--disable-software-rasterizer');
  }

  return args;
}

export async function logPageState(page: Page, label: string): Promise<void> {
  console.log(`[CI-DIAG] ${label} - Page State:`);

  try {
    const url = page.url();
    console.log(`  URL: ${url}`);

    const title = await page.title();
    console.log(`  Title: ${title}`);

    const visibleText = await page.locator('body').textContent({ timeout: 1000 });
    console.log(`  Body text (first 200 chars): ${visibleText?.substring(0, 200)}...`);

    // 截图（如果配置了）
    if (process.env.CI_DEBUG_SCREENSHOTS) {
      const screenshotPath = `test-results/debug-${label}-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });
      console.log(`  Screenshot: ${screenshotPath}`);
    }
  } catch (e) {
    console.log(`  Error getting page state: ${e}`);
  }
}

export async function logElectronState(app: ElectronApplication): Promise<void> {
  console.log('[CI-DIAG] Electron State:');

  try {
    const windows = await app.windows();
    console.log(`  Window count: ${windows.length}`);

    for (let i = 0; i < windows.length; i++) {
      const win = windows[i];
      const title = await win.title();
      const url = win.url();
      console.log(`  Window ${i}: ${title} - ${url}`);
    }
  } catch (e) {
    console.log(`  Error getting electron state: ${e}`);
  }
}

export function printDiagnostics(info: DiagnosticsInfo): void {
  console.log('\n========================================');
  console.log('CI Diagnostics Information');
  console.log('========================================');
  console.log(`Timestamp: ${info.timestamp}`);
  console.log(`Node: ${info.nodeVersion}`);
  console.log(`Platform: ${info.platform} (${info.arch})`);
  console.log(`CPUs: ${info.cpus}`);
  console.log(`Memory: ${info.freeMemory} / ${info.totalMemory}`);
  console.log(`Xvfb Display: ${info.xvfbDisplay || 'not set'}`);
  console.log('\nEnvironment:');
  Object.entries(info.environment).forEach(([key, value]) => {
    console.log(`  ${key}: ${value || 'not set'}`);
  });
  console.log('\nElectron Args:');
  info.electronArgs.forEach(arg => console.log(`  ${arg}`));
  console.log('========================================\n');
}
