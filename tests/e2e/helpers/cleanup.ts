import type { ElectronApplication, Page } from '@playwright/test';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(currentDir, '..', '..', '..');

/**
 * Perform extra cleanup when a test is being retried
 * This ensures a clean state for the retry attempt
 * 
 * @param app - Electron application instance
 * @param page - Page instance (optional)
 * @param retry - Current retry count
 */
export async function extraCleanupOnRetry(
  app: ElectronApplication,
  page: Page | undefined,
  retry: number
): Promise<void> {
  if (retry === 0) return;
  
  console.log(`[retry ${retry}] Performing extra cleanup...`);
  
  try {
    // 1. Close all child windows (keep main window)
    await app.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(w => {
        if (!w.isDestroyed() && !w.isMainWindow) {
          try { 
            w.close(); 
          } catch {}
        }
      });
    }).catch(() => {});
    
    // 2. Clear browser storage if page is available
    if (page) {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      }).catch(() => {});
      
      // Clear cookies
      await page.context().clearCookies().catch(() => {});
    }
    
    // 3. Wait for cleanup to take effect
    await new Promise(r => setTimeout(r, 500));
    
    // 4. Clean up data directory JSON files
    await cleanupDataDirectory();
    
    // 5. Reset mock server state if available
    await resetMockServer().catch(() => {});
    
    console.log(`[retry ${retry}] Extra cleanup done`);
  } catch (error) {
    console.log(`[retry ${retry}] Cleanup warning (non-fatal):`, error);
  }
}

/**
 * Clean up data directory JSON files
 */
export async function cleanupDataDirectory(): Promise<void> {
  const dataDir = path.join(rootDir, 'data');
  
  if (!existsSync(dataDir)) {
    return;
  }
  
  try {
    const files = await fs.readdir(dataDir);
    const cleanupPromises = files
      .filter(file => file.endsWith('.json'))
      .map(async (file) => {
        try {
          await fs.unlink(path.join(dataDir, file));
        } catch {
          // Ignore cleanup errors
        }
      });
    
    await Promise.all(cleanupPromises);
  } catch {
    // Ignore directory read errors
  }
}

/**
 * Reset global mock server state
 * Note: This requires the mock server to be accessible
 */
async function resetMockServer(): Promise<void> {
  // Import dynamically to avoid circular dependencies
  const { globalMockServer } = await import('../global-setup');
  if (globalMockServer && typeof globalMockServer.setResponses === 'function') {
    await globalMockServer.waitForPendingRequests();
    globalMockServer.setResponses({});
  }
}

/**
 * Complete cleanup function for test fixtures
 * Called in the finally block to ensure clean state
 * 
 * @param app - Electron application instance
 * @param page - Page instance (optional)
 * @param retry - Current retry count
 */
export async function completeCleanup(
  app: ElectronApplication,
  page: Page | undefined,
  retry: number
): Promise<void> {
  // Perform extra cleanup if retrying
  if (retry > 0) {
    await extraCleanupOnRetry(app, page, retry);
  }
  
  // Always ensure windows are closed
  try {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach((w) => {
        try {
          w.close();
        } catch {}
      });
    }).catch(() => {});
  } catch {
    // Ignore window close errors
  }
  
  // Always close the app
  try {
    await app.close();
  } catch {
    // Ignore close errors
  }
  
  // Final cleanup of persistence files
  await cleanupDataDirectory();
}
