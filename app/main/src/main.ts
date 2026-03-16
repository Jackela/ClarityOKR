import path from 'node:path';
import { fileURLToPath } from 'node:url';

import electron from 'electron';
import type { BrowserWindow as ElectronBrowserWindow, Event as ElectronEvent } from 'electron';

import { Logger } from './core/logger.js';
import { ActionLogWriter } from './persistence/action-log-writer.js';
import { OkrRepository } from './persistence/okr-repository.js';
import { SessionRepository } from './persistence/session-repository.js';
import { OkrAgentService } from './services/okr-agent.service.js';
import { initializeTestMode, type TestMode } from './test-mode.js';
import { ClarificationController } from './windows/clarification-controller.js';
import { StickyWindowManager } from './windows/sticky-window-manager.js';

const { app, BrowserWindow } = electron;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.resolve(currentDir, 'bootstrap', 'preload.cjs');
const rendererDistPath = path.resolve(currentDir, '../../renderer/dist');

const sessionRepository = new SessionRepository();
const okrRepository = new OkrRepository();
const actionLogWriter = new ActionLogWriter();
const stickyWindowManager = new StickyWindowManager({
  preloadPath,
  rendererDistPath,
});
const okrAgentService = new OkrAgentService();

let mainWindow: ElectronBrowserWindow | null = null;

// Instantiate IPC controllers once the process starts.
const clarificationController = new ClarificationController(
  sessionRepository,
  okrRepository,
  actionLogWriter,
  stickyWindowManager,
  okrAgentService,
);

// Initialize TestMode API for E2E testing
let testMode: TestMode | null = null;
if (process.env.NODE_ENV === 'test' || process.env.CI || process.env.E2E_TEST) {
  testMode = initializeTestMode(
    clarificationController,
    sessionRepository,
    okrRepository,
    actionLogWriter,
  );
  Logger.info('[main] TestMode initialized:', !!testMode);
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

async function createWindow(): Promise<void> {
  const indexPath = path.join(rendererDistPath, 'index.html');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#f8f9ff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  Logger.error('Uncaught exception in main process', error);
});

// Export for test access
export { testMode };
