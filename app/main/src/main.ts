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
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { IPC_CHANNELS } from '@clarityokr/contracts';
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
import { KrRegenerationService } from './regenerate/kr-regeneration.service.js';

import { resolveDbPath } from './startup/db-path.js';
import { LegacyDatabaseNotice, registerLegacyNoticeHandlers } from './startup/legacy-notice.js';
import {
  registerReminderHandlers,
  reminderClock,
  startReminderTicks,
} from './reminders/reminder-scheduler.js';
import { ReminderSettings } from './reminders/reminder-settings.js';
import { ReviewHandoff, registerReviewHandoffHandlers } from './reminders/review-handoff.js';
import { openDatabaseSafely } from './startup/open-database.js';
import { wireClosedLoop } from './startup/closed-loop.js';
import { registerStorageStateHandler } from './startup/storage-state.js';
import { registerAppWindowHandlers, UnsavedRegistry } from './ipc/app-window-handlers.js';
import { ExitCoordinator, type ExitWindow } from './lifecycle/exit-coordinator.js';
import { QuitGate, guardBeforeQuit, hideOnClose, hideQuits } from './lifecycle/quit-gate.js';
import {
  appMenuTemplate,
  trayIconPath,
  trayMenuTemplate,
  wireTray,
  type ShellActions,
} from './lifecycle/tray-and-menu.js';
import { ClarificationController } from './windows/clarification-controller.js';
import { StickyWindowManager } from './windows/sticky-window-manager.js';
import { registerRendererProtocol } from './windows/renderer-protocol.js';

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  clipboard,
  Menu,
  Tray,
  nativeImage,
  webContents,
} = electron;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.resolve(currentDir, 'bootstrap', 'preload.cjs');
const rendererDistPath =
  process.env.E2E_TEST === '1' && process.env.E2E_RENDERER_DIR
    ? path.resolve(process.env.E2E_RENDERER_DIR)
    : path.resolve(currentDir, '../../renderer/dist');

// e2e: every launch gets its own profile next to its database, so the single-instance lock of
// one test app never makes another one exit.
if (process.env.E2E_TEST && process.env.E2E_DB_PATH) {
  app.setPath(
    'userData',
    path.join(path.dirname(path.resolve(process.env.E2E_DB_PATH)), 'profile'),
  );
}

// Single instance (spec §1.2a): a second launch only brings the sticky note back (see
// `second-instance` below) and exits before touching the database.
if (!app.requestSingleInstanceLock()) {
  Logger.info('[main] Another instance is running; handing over and exiting');
  app.exit(0);
  await new Promise<never>(() => undefined);
}

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
// #54: closed review banners live next to the database; in memory mode only for this run.
const reminderSettings = new ReminderSettings(
  openedDatabase.storageMode === 'memory' ? null : path.dirname(dbPath),
);
registerReminderHandlers(ipcMain, reminderSettings, reminderClock());

const connectionManager = openedDatabase.connectionManager;

const sessionRepository = new SqliteSessionRepository(connectionManager);
const okrStore = new OkrStore(connectionManager.getDb());
const okrRepository = new OkrStoreRepository(okrStore);
const actionLogWriter = new SQLiteActionLogWriter(connectionManager);

const unsavedRegistry = new UnsavedRegistry();
const { restartService } = wireClosedLoop({
  ipcMain,
  store: okrStore,
  storageMode: openedDatabase.storageMode,
  dialog,
  shell,
  clipboard,
  getDownloadsDir: () => app.getPath('downloads'),
  getFocusedWindow: () => BrowserWindow.getFocusedWindow(),
  appVersion: appVersion(),
  // §3.7: the services it needs are created just below; they exist by the first request.
  regenerate: (request) => krRegeneration.regenerate(request),
});

const okrAgentService = new OkrAgentService();
const okrRegenerationService = new OkrRegenerationService(
  sessionRepository,
  okrRepository,
  okrAgentService,
);
const krRegeneration = new KrRegenerationService({
  store: okrStore,
  turnsFor: (sessionId) => okrRegenerationService.turnsFor(sessionId),
  generate: (context) => okrRegenerationService.generate(context),
  newId: () => randomUUID(),
  changed: (objective) => {
    // The windows take the OKR text from the document; send them the new one.
    void okrRepository.findById(objective.id).then((okr) => {
      if (!okr) return;
      for (const contents of webContents.getAllWebContents()) {
        if (!contents.isDestroyed()) contents.send(IPC_CHANNELS.OKR_GENERATE, { okr });
      }
    });
  },
});
const stickyWindowManager: StickyWindowManager = new StickyWindowManager({
  preloadPath,
  rendererDistPath,
  okrRepository,
  actionLogWriter,
  okrAgentService,
  sessionRepository,
  okrRegeneration: okrRegenerationService,
  isQuitting: () => quitGate.isQuitting(),
  closeQuits: (): boolean => lastVisibleQuits(stickyWindowManager.getWindow()),
  requestQuit: () => void exitCoordinator.requestQuit(),
});

// #84 review: 「去复盘」 from the main window opens the review page in the sticky shell.
registerReviewHandoffHandlers(
  ipcMain,
  new ReviewHandoff({
    bringToFront: () => stickyWindowManager.bringToFront(),
    currentShell: () => stickyWindowManager.getWebContentsId(),
    // #88: only called once the shell said it is ready, so this message is never lost
    notify: () =>
      stickyWindowManager.getWindow()?.webContents.send(IPC_CHANNELS.REMINDERS_OPEN_REVIEW),
  }),
);

let mainWindow: ElectronBrowserWindow | null = null;
/** `quitting` (windows may really close) and `allowed` (before-quit lets the quit through). */
const quitGate = new QuitGate();

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

  const contentsId = mainWindow.webContents.id;
  // Closing the main window hides it (like the sticky note): its wizard and unsaved state
  // stay, and the app keeps running in the tray (B2).
  const thisWindow = mainWindow;
  hideOnClose(
    mainWindow,
    () => quitGate.isQuitting(),
    () => lastVisibleQuits(thisWindow),
    () => void exitCoordinator.requestQuit(),
  );
  mainWindow.on('closed', () => {
    mainWindow = null;
    exitCoordinator.windowGone(contentsId);
  });

  // Every window (the sticky note shows the reminders) re-reads them.
  const tick = (): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.REMINDERS_TICK);
    }
  };
  const stopReminderTicks = startReminderTicks(
    {
      onFocus: (listener) => {
        app.on('browser-window-focus', listener);
        return () => app.removeListener('browser-window-focus', listener);
      },
      onResume: (listener) => {
        electron.powerMonitor.on('resume', listener);
        return () => electron.powerMonitor.removeListener('resume', listener);
      },
      setInterval: (listener, ms) => {
        const timer = setInterval(listener, ms);
        return () => clearInterval(timer);
      },
    },
    tick,
  );
  thisWindow.on('closed', stopReminderTicks);

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

/** Shows and focuses the main window, creating it when needed. Returns whether it was created. */
async function ensureMainWindow(): Promise<{ window: ElectronBrowserWindow; created: boolean }> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createWindow();
    const created = mainWindow as unknown as ElectronBrowserWindow;
    created.show();
    created.focus();
    return { window: created, created: true };
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return { window: mainWindow, created: false };
}

function toExitWindow(window: ElectronBrowserWindow): ExitWindow {
  const contents = window.webContents;
  return {
    id: contents.id,
    send: (channel, payload) => {
      if (!contents.isDestroyed()) contents.send(channel, payload);
    },
    isDestroyed: () => window.isDestroyed() || contents.isDestroyed(),
    focus: () => {
      if (window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    },
  };
}

/** 显示便签: the sticky note, or the main window when there is no sticky note this run. */
async function showSticky(): Promise<void> {
  try {
    if (await stickyWindowManager.bringToFront()) return;
    await ensureMainWindow();
  } catch (error) {
    Logger.error('[main] Could not show the sticky note', error);
  }
}

const exitCoordinator = new ExitCoordinator({
  evaluate: (unsaved) => restartService.evaluate(unsaved),
  reportedUnsaved: () => unsavedRegistry.aggregate(),
  showWindow: async (which) => {
    if (which === 'sticky') {
      if (!(await stickyWindowManager.bringToFront())) return null;
      const sticky = stickyWindowManager.getWindow();
      return sticky ? toExitWindow(sticky) : null;
    }
    const { window, created } = await ensureMainWindow();
    if (created && window.webContents.isLoading()) {
      await new Promise<void>((resolve) => window.webContents.once('did-finish-load', resolve));
    }
    return toExitWindow(window);
  },
  quit: () => quitGate.quit(() => app.quit()),
  // Both flags are restored when relaunching throws (B1).
  relaunch: () =>
    quitGate.relaunch(
      () => app.relaunch(),
      () => app.quit(),
    ),
});

const shellActions: ShellActions = {
  showSticky: () => void showSticky(),
  quit: () => void exitCoordinator.requestQuit(),
};

registerAppWindowHandlers(ipcMain, {
  unsaved: unsavedRegistry,
  showMainWindow: async () => {
    const { window, created } = await ensureMainWindow();
    if (created) return null;
    const contents = window.webContents;
    return { send: (channel: string) => contents.send(channel) };
  },
  exit: exitCoordinator,
  windowOf: (senderId) => {
    const window = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.webContents.id === senderId,
    );
    return window ? toExitWindow(window) : null;
  },
  sticky: {
    isSticky: (senderId) => stickyWindowManager.getWebContentsId() === senderId,
    hide: () => {
      if (lastVisibleQuits(stickyWindowManager.getWindow())) {
        void exitCoordinator.requestQuit();
        return false;
      }
      stickyWindowManager.hideStickyWindow();
      return true;
    },
    hideQuits: () => lastVisibleQuits(stickyWindowManager.getWindow()),
    isAlwaysOnTop: () => stickyWindowManager.isAlwaysOnTop(),
    setAlwaysOnTop: (enabled) => stickyWindowManager.setAlwaysOnTop(enabled),
  },
});

let tray: InstanceType<typeof Tray> | null = null;

/**
 * N15: hiding `window` would leave nothing to call the app back with (Windows / Linux, no
 * tray icon, no other visible window), so it is a quit instead.
 */
function lastVisibleQuits(window: ElectronBrowserWindow | null): boolean {
  const otherVisible = BrowserWindow.getAllWindows().some(
    (w) => w !== window && !w.isDestroyed() && w.isVisible(),
  );
  return hideQuits({ platform: process.platform, trayAvailable: tray !== null, otherVisible });
}

function createTray(): void {
  try {
    const iconPath = trayIconPath(path.resolve(currentDir, '../resources'), process.platform);
    const image = nativeImage.createFromPath(iconPath);
    if (process.platform === 'darwin') image.setTemplateImage(true);
    tray = new Tray(image);
    const menu = Menu.buildFromTemplate(trayMenuTemplate(shellActions));
    wireTray(tray, menu, shellActions, process.platform);
  } catch (error) {
    // No tray on this desktop: the single-instance recall and the menu still work.
    Logger.error('[main] Could not create the tray icon', error);
  }
}

app.on('second-instance', () => {
  Logger.info('[main] Second launch: showing the sticky note');
  void showSticky();
});

// N16: Windows ends the session (log off / shut down) without waiting for a dialog.
app.on('browser-window-created', (_event, window) => {
  window.on('session-end', () => {
    Logger.info('[main] The session is ending; quitting without the confirmation');
    quitGate.sessionEnd();
  });
});

if (testMode) {
  // E2E only: run as if the tray icon could not be created (N15).
  (globalThis as { __clarityokrE2E?: unknown }).__clarityokrE2E = {
    dropTray: () => {
      tray?.destroy();
      tray = null;
    },
  };
}

void app.whenReady().then(() => {
  registerRendererProtocol(rendererDistPath, electron.protocol, electron.net);
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate(shellActions, process.platform)));
  createTray();
  void createWindow();

  // macOS Dock icon: show the sticky note.
  app.on('activate', () => {
    void showSticky();
  });
});

/**
 * Handles application shutdown when all windows are closed.
 *
 * On macOS, applications typically remain active until explicitly quit,
 * so we only quit on other platforms.
 */
app.on('before-quit', (event: ElectronEvent) => {
  // ⌘Q, the system, or anything else: same confirmation as the menu and the tray (§1.2c).
  guardBeforeQuit(quitGate, () => exitCoordinator.requestQuit(), event);
  if (quitGate.isQuitting()) Logger.info('[main] Application is quitting');
});

// The app keeps running in the tray when its windows are closed or hidden; it quits only
// through 退出 (menu / tray / ⌘Q).
app.on('window-all-closed', () => {
  Logger.info('[main] All windows closed; still running in the tray');
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

/**
 * The ClarityOKR version written into backups (#50). Packaged builds report it through
 * `app.getVersion()`; started from source (dev, e2e) Electron would report its own version, so the
 * main package's package.json is read instead.
 */
function appVersion(): string {
  if (app.isPackaged) return app.getVersion();
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version?: unknown;
    };
    return typeof pkg.version === 'string' ? pkg.version : app.getVersion();
  } catch {
    return app.getVersion();
  }
}
