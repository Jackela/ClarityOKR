import electron from 'electron';
import type { BrowserWindow as ElectronBrowserWindow, Event as ElectronEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ActionLogWriter } from './persistence/action-log-writer.js';
import { OkrRepository } from './persistence/okr-repository.js';
import { SessionRepository } from './persistence/session-repository.js';
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
  rendererDistPath
});

let mainWindow: ElectronBrowserWindow | null = null;
// Instantiate IPC controllers once the process starts.
new ClarificationController(sessionRepository, okrRepository, actionLogWriter, stickyWindowManager);

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
      preload: preloadPath
    }
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
    console.info('[main] renderer loaded');
  });

  mainWindow.webContents.on('did-fail-load', (_event: ElectronEvent, errorCode: number, errorDescription: string) => {
    console.error('[main] renderer failed to load', errorCode, errorDescription);
  });
}

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in main process', error);
});
