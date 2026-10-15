import type { StorageModeName } from '@clarityokr/contracts';
import type { BrowserWindow, Clipboard, Dialog, IpcMain, Shell } from 'electron';

import { ExportService, type SaveDialogRequest } from '../export/export-service.js';
import { ImportService } from '../import/import-service.js';
import type { ExportSource } from '../export/export-document.js';
import {
  registerClosedLoopHandlers,
  type ClosedLoopHandlerDeps,
} from '../ipc/closed-loop-handlers.js';
import { AppRestartService } from '../lifecycle/restart-service.js';
import type { OkrStore } from '../persistence/okr-store/okr-store.js';

export interface ClosedLoopWiringDeps {
  ipcMain: Pick<IpcMain, 'handle'>;
  store: OkrStore;
  storageMode: StorageModeName;
  dialog: Pick<Dialog, 'showSaveDialog' | 'showOpenDialog'>;
  shell: Pick<Shell, 'showItemInFolder'>;
  clipboard: Pick<Clipboard, 'writeText'>;
  getDownloadsDir: () => string;
  getFocusedWindow: () => BrowserWindow | null;
  regenerate?: ClosedLoopHandlerDeps['regenerate'];
  /** Written into backups. */
  appVersion?: string;
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
  importService: ImportService;
  restartService: AppRestartService;
} {
  const exportService = new ExportService({
    loadSource: (okrId) => loadExportSource(deps.store, okrId),
    loadAllSources: () =>
      deps.store
        .listObjectives()
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((objective) => loadExportSource(deps.store, objective.id))
        .filter((source): source is ExportSource => source !== null),
    appVersion: deps.appVersion ?? '',
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
  });
  const importService = new ImportService({
    showOpenDialog: async () => {
      const options = {
        defaultPath: deps.getDownloadsDir(),
        filters: [FILTERS.json],
        properties: ['openFile' as const],
      };
      const window = deps.getFocusedWindow();
      const result = window
        ? await deps.dialog.showOpenDialog(window, options)
        : await deps.dialog.showOpenDialog(options);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    listExisting: () => deps.store.listObjectiveSummaries(),
    write: (items) => deps.store.importObjectives(items),
    isMemory: () => deps.storageMode === 'memory',
  });
  registerClosedLoopHandlers(deps.ipcMain, {
    store: deps.store,
    exportService,
    importService,
    clipboard: deps.clipboard,
    ...(deps.regenerate ? { regenerate: deps.regenerate } : {}),
  });
  return { exportService, importService, restartService };
}
