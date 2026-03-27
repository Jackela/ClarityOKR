import type { IpcRendererEvent } from 'electron';
import { contextBridge, ipcRenderer } from 'electron';

import { validateChannel, type AllowedChannel } from '@clarityokr/contracts';

/**
 * 验证 IPC 通道是否在白名单中
 * @param channel - 要验证的通道名
 * @throws Error 如果通道不在白名单中
 */
function validateChannelInternal(channel: string): asserts channel is AllowedChannel {
  validateChannel(channel);
}

/**
 * Type-safe IPC API for renderer process
 */
interface ClarifyOkrApi {
  /**
   * Send a message to the main process
   * @param channel - The IPC channel name (must be in whitelist)
   * @param payload - Optional payload data
   */
  send: (channel: AllowedChannel, payload?: unknown) => void;

  /**
   * Invoke a method in the main process and await a response
   * @param channel - The IPC channel name (must be in whitelist)
   * @param payload - Optional payload data
   * @returns Promise that resolves with the response
   */
  invoke: (channel: AllowedChannel, payload?: unknown) => Promise<unknown>;

  /**
   * Listen for messages from the main process
   * @param channel - The IPC channel name (must be in whitelist)
   * @param listener - Callback function for received messages
   * @returns Unsubscribe function to remove the listener
   */
  on: (
    channel: AllowedChannel,
    listener: (event: IpcRendererEvent, payload: unknown) => void,
  ) => () => void;
}

const api: ClarifyOkrApi = {
  send: (channel, payload) => {
    validateChannelInternal(channel);
    ipcRenderer.send(channel, payload);
  },
  invoke: (channel, payload) => {
    validateChannelInternal(channel);
    return ipcRenderer.invoke(channel, payload);
  },
  on: (channel, listener) => {
    validateChannelInternal(channel);
    ipcRenderer.on(channel, listener);
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
};

contextBridge.exposeInMainWorld('clarifyOkr', api);

// Export type for TypeScript declarations
export type { ClarifyOkrApi };
