import type { StorageModeName } from '@clarityokr/contracts';
import type { BrowserWindow, Clipboard, Dialog, IpcMain, Shell } from 'electron';

import { ExportService, type SaveDialogRequest } from '../export/export-service.js';
import type { ExportSource } from '../export/export-document.js';
import { registerClosedLoopHandlers } from '../ipc/closed-loop-handlers.js';
import { AppRestartService } from '../lifecycle/restart-service.js';
import type { OkrStore } from '../persistence/okr-store/okr-store.js';

export interface ClosedLoopWiringDeps {
  ipcMain: Pick<IpcMain, 'handle'>;
  store: OkrStore;
  storageMode: StorageModeName;
  dialog: Pick<Dialog, 'showSaveDialog'>;
  shell: Pick<Shell, 'showItemInFolder'>;
  clipboard: Pick<Clipboard, 'writeText'>;
  getDownloadsDir: () => string;
  getFocusedWindow: () => BrowserWindow | null;
  /** `app.relaunch()` followed by `app.quit()`. */
  relaunch: () => void;
}

/** Reads the data of one OKR for an export (null for an unknown id). */
export function loadExportSource(store: OkrStore, okrId: string): ExportSource | null {
  const objective = store.getObjective(okrId);
  if (!objective) {
    return null;
  }
  const progressEntries = objective.keyResults
    .flatMap((kr) => store.listProgressEntries(kr.id))
    .sort((a, b) => a.id - b.id);
  return { objective, progressEntries, review: store.getReview(okrId) };
}

const FILTERS: Record<SaveDialogRequest['format'], { name: string; extensions: string[] }> = {
  md: { name: 'Markdown', extensions: ['md'] },
  json: { name: 'JSON', extensions: ['json'] },
};

/** Registers the closed-loop IPC channels with the real Electron dialog/shell. */
export function wireClosedLoop(deps: ClosedLoopWiringDeps): {
  exportService: ExportService;
  restartService: AppRestartService;
} {
  const exportService = new ExportService({
    loadSource: (okrId) => loadExportSource(deps.store, okrId),
    showSaveDialog: async ({ defaultPath, format }) => {
      const options = { defaultPath, filters: [FILTERS[format]] };
      const window = deps.getFocusedWindow();
      const result = window
        ? await deps.dialog.showSaveDialog(window, options)
        : await deps.dialog.showSaveDialog(options);
      return result.canceled || !result.filePath ? null : result.filePath;
    },
    showItemInFolder: (path) => deps.shell.showItemInFolder(path),
    getDownloadsDir: deps.getDownloadsDir,
  });
  const restartService = new AppRestartService({
    getStorageMode: () => deps.storageMode,
    dbHasData: () => deps.store.hasAnyData(),
    relaunch: deps.relaunch,
  });
  registerClosedLoopHandlers(deps.ipcMain, {
    store: deps.store,
    exportService,
    restartService,
    clipboard: deps.clipboard,
  });
  return { exportService, restartService };
}
