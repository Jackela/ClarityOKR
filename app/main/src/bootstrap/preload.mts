import { createRequire } from 'node:module';
import type { IpcRendererEvent } from 'electron';

const require = createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

type ClarifyOkrApi = {
  send: (channel: string, payload?: unknown) => void;
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  on: (channel: string, listener: (event: IpcRendererEvent, payload: unknown) => void) => void;
};

const api: ClarifyOkrApi = {
  send: (channel, payload) => {
    ipcRenderer.send(channel, payload);
  },
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, listener) => {
    ipcRenderer.on(channel, listener);
  }
};

contextBridge.exposeInMainWorld('clarifyOkr', api);
