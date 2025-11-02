import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

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
