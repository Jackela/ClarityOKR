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
import { ConnectionManager } from './persistence/connection-manager.js';
import { SQLiteActionLogWriter } from './persistence/action-log-writer.js';
import { OKRRepositorySqlite } from './persistence/okr-repository.js';
import { SqliteSessionRepository } from './persistence/sqlite-session-repository.js';
import { MigrationService } from './persistence/migration.service.js';
import { OkrAgentService } from './services/okr-agent.service.js';
import { OkrRegenerationService } from './services/okr-regeneration.service.js';

import { ClarificationController } from './windows/clarification-controller.js';
import { StickyWindowManager } from './windows/sticky-window-manager.js';

const { app, BrowserWindow, ipcMain } = electron;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.resolve(currentDir, 'bootstrap', 'preload.js');
const rendererDistPath = path.resolve(currentDir, '../../renderer/dist');

const connectionManager = new ConnectionManager({
  dbPath: path.resolve(currentDir, '../../data/clarityokr.db'),
});
connectionManager.initialize();

const sessionRepository = new SqliteSessionRepository(connectionManager);
const okrRepository = new OKRRepositorySqlite(connectionManager);
const actionLogWriter = new SQLiteActionLogWriter(connectionManager);

const migrationService = new MigrationService(connectionManager);
if (migrationService.needsMigration()) {
  void migrationService.migrate();
}

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

void app.whenReady().then(() => {
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
