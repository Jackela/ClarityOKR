import type { IpcMain } from 'electron';

import { IPC_CHANNELS } from '@clarityokr/contracts';

import type { StorageMode } from './open-database.js';

/** Lets the renderer tell the user when data is not being saved normally. Never reveals a path. */
export function registerStorageStateHandler(
  ipcMain: Pick<IpcMain, 'handle'>,
  storageMode: StorageMode,
): void {
  ipcMain.handle(IPC_CHANNELS.STORAGE_STATE_GET, () => ({ storageMode }));
}
