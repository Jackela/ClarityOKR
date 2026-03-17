import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { IPCChannels } from './ipc-channels.js';

// IPC 通道白名单 - 只允许这些通道的通信
const ALLOWED_CHANNELS: string[] = Object.values(IPCChannels);

/**
 * 验证 IPC 通道是否在白名单中
 * @param channel - 要验证的通道名
 * @throws Error 如果通道不在白名单中
 */
function validateChannel(channel: string): void {
  if (!ALLOWED_CHANNELS.includes(channel)) {
    throw new Error(`Unauthorized IPC channel: ${channel}. This channel is not in the allowlist.`);
  }
}

const api = {
  send: (channel: string, payload?: unknown) => {
    validateChannel(channel);
    ipcRenderer.send(channel, payload);
  },
  invoke: (channel: string, payload?: unknown) => {
    validateChannel(channel);
    return ipcRenderer.invoke(channel, payload);
  },
  on: (channel: string, listener: (event: IpcRendererEvent, payload: unknown) => void) => {
    validateChannel(channel);
    ipcRenderer.on(channel, listener);
  },
};

contextBridge.exposeInMainWorld('clarifyOkr', api);
