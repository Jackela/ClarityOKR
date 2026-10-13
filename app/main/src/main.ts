/**
 * ClarityOKR - Main Electron Process Entry Point
 *
 * This module initializes the Electron application, bootstraps the main window,
 * and orchestrates all core services for the OKR clarification workflow.
 *
 * Key Responsibilities:
 * - Application lifecycle management (startup, window creation, shutdown)
 * - Dependency injection and service initialization
 * - Secure IPC channel registration via ClarificationController
 * - Renderer process error handling and logging
 * - Test mode initialization for E2E testing
 *
 * Dependencies:
 * - Electron: Core runtime and window management
 * - ClarificationController: Central coordinator for IPC handlers
 * - Repositories: Session, OKR, and action log persistence
 * - Services: LLM agent, window management
 *
 * @module main
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import electron from 'electron';
import type {
  BrowserWindow as ElectronBrowserWindow,
  Event as ElectronEvent,
  IpcMainEvent,
} from 'electron';

import { Logger } from './core/logger.js';
import { SQLiteActionLogWriter } from './persistence/action-log-writer.js';
import { OkrStore, OkrStoreRepository } from './persistence/okr-store/index.js';
import { SqliteSessionRepository } from './persistence/sqlite-session-repository.js';
import { OkrAgentService } from './services/okr-agent.service.js';
import { OkrRegenerationService } from './services/okr-regeneration.service.js';

import { resolveDbPath } from './startup/db-path.js';
import { LegacyDatabaseNotice, registerLegacyNoticeHandlers } from './startup/legacy-notice.js';
import { openDatabaseSafely } from './startup/open-database.js';
import { wireClosedLoop } from './startup/closed-loop.js';
import { registerStorageStateHandler } from './startup/storage-state.js';
import { registerAppWindowHandlers, UnsavedRegistry } from './ipc/app-window-handlers.js';
import { ClarificationController } from './windows/clarification-controller.js';
import { StickyWindowManager } from './windows/sticky-window-manager.js';
import { registerRendererProtocol } from './windows/renderer-protocol.js';

const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = electron;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.resolve(currentDir, 'bootstrap', 'preload.cjs');
const rendererDistPath =
  process.env.E2E_TEST === '1' && process.env.E2E_RENDERER_DIR
    ? path.resolve(process.env.E2E_RENDERER_DIR)
    : path.resolve(currentDir, '../../renderer/dist');

const dbPath = resolveDbPath({
  e2eTest: Boolean(process.env.E2E_TEST),
  e2eDbPath: process.env.E2E_DB_PATH,
  userDataDir: app.getPath('userData'),
});

// A database from before schema versioning (or an unreadable file) is kept aside in backups/
// and not imported. Opening never throws: a bad file falls back to a fresh database.
const legacyNotice = new LegacyDatabaseNotice(path.dirname(dbPath));
const openedDatabase = openDatabaseSafely({
  dbPath,
  backupsDir: path.join(path.dirname(dbPath), 'backups'),
  notice: legacyNotice,
});
if (openedDatabase.storageMode !== 'normal') {
  Logger.error(
    '[main] Running on a fallback database:',
    openedDatabase.storageMode,
    openedDatabase.activePath,
  );
}
registerLegacyNoticeHandlers(ipcMain, legacyNotice);
registerStorageStateHandler(ipcMain, openedDatabase.storageMode);

const connectionManager = openedDatabase.connectionManager;

const sessionRepository = new SqliteSessionRepository(connectionManager);
const okrStore = new OkrStore(connectionManager.getDb());
const okrRepository = new OkrStoreRepository(okrStore);
const actionLogWriter = new SQLiteActionLogWriter(connectionManager);

const unsavedRegistry = new UnsavedRegistry();
wireClosedLoop({
  ipcMain,
  reportedUnsaved: () => unsavedRegistry.aggregate(),
  store: okrStore,
  storageMode: openedDatabase.storageMode,
  dialog,
  shell,
  clipboard,
  getDownloadsDir: () => app.getPath('downloads'),
  getFocusedWindow: () => BrowserWindow.getFocusedWindow(),
  relaunch: () => {
    isQuitting = true;
    app.relaunch();
    app.quit();
  },
});

const okrAgentService = new OkrAgentService();
const okrRegenerationService = new OkrRegenerationService(
  sessionRepository,
  okrRepository,
  okrAgentService,
);
const stickyWindowManager = new StickyWindowManager({
  preloadPath,
  rendererDistPath,
  okrRepository,
  actionLogWriter,
  okrAgentService,
  sessionRepository,
  okrRegeneration: okrRegenerationService,
  isQuitting: () => isQuitting,
});

let mainWindow: ElectronBrowserWindow | null = null;
let isQuitting = false;

// Instantiate IPC controllers once the process starts.
const clarificationController = new ClarificationController(
  sessionRepository,
  okrRepository,
  actionLogWriter,
  stickyWindowManager,
  okrAgentService,
  okrRegenerationService,
);

let testMode: unknown = null;
if (process.env.NODE_ENV === 'test' || process.env.CI || process.env.E2E_TEST) {
  const { initializeTestMode } = await import('./test-mode.js');
  testMode = initializeTestMode({
    controller: clarificationController,
    sessionRepo: sessionRepository,
    okrRepo: okrRepository,
    actionLogWriter,
  });
  Logger.info('[main] TestMode initialized:', !!testMode);
}

/**
 * Creates and configures the main application window.
 *
 * Sets up security-hardened BrowserWindow with context isolation enabled,
 * loads the renderer application, and attaches event listeners for window
 * lifecycle and load status.
 *
 * @returns Promise that resolves when the window is created and loaded
 * @throws Error if window creation or loading fails
 *
 * @example
 * ```typescript
 * await createWindow();
 * // Main window is now visible and loaded
 * ```
 */
async function createWindow(): Promise<void> {
  const indexPath = path.join(rendererDistPath, 'index.html');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#f8f9ff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
      allowRunningInsecureContent: false,
      webSecurity: true,
    },
  });

  if (process.env.ELECTRON_START_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    await mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    Logger.info('[main] renderer loaded');
  });

  mainWindow.webContents.on(
    'did-fail-load',
    (_event: ElectronEvent, errorCode: number, errorDescription: string) => {
      Logger.error('[main] renderer failed to load', errorCode, errorDescription);
    },
  );
}

registerAppWindowHandlers(ipcMain, {
  unsaved: unsavedRegistry,
  showMainWindow: async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      await createWindow();
      mainWindow?.show();
      mainWindow?.focus();
      return null;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    const contents = mainWindow.webContents;
    return { send: (channel: string) => contents.send(channel) };
  },
});

void app.whenReady().then(() => {
  registerRendererProtocol(rendererDistPath, electron.protocol, electron.net);
  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

/**
 * Handles application shutdown when all windows are closed.
 *
 * On macOS, applications typically remain active until explicitly quit,
 * so we only quit on other platforms.
 */
app.on('before-quit', () => {
  isQuitting = true;
  Logger.info('[main] Application is quitting, allowing windows to close');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Global uncaught exception handler for the main process.
 *
 * Logs fatal errors to prevent silent failures and aid debugging.
 *
 * @param error - The uncaught exception error
 */
process.on('uncaughtException', (error) => {
  Logger.error('Uncaught exception in main process', error);
});

/**
 * Handles error reports from the renderer process.
 *
 * Receives errors caught in the renderer via IPC and logs them
 * with full context for debugging cross-process issues.
 *
 * @param _event - The IPC event (unused)
 * @param report - Error report containing message, stack trace, and context
 * @param report.message - Error message
 * @param report.stack - Optional stack trace
 * @param report.timestamp - When the error occurred
 * @param report.url - Optional URL where the error occurred
 */
ipcMain.on(
  'clarityokr:error:report',
  (
    _event: IpcMainEvent,
    report: { message: string; stack?: string; timestamp: string; url?: string },
  ) => {
    Logger.error('[renderer-error-report]', {
      message: report.message,
      stack: report.stack,
      timestamp: report.timestamp,
      url: report.url,
    });
  },
);

export { testMode };
