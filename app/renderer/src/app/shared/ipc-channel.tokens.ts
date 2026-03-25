import {
  IPC_CHANNELS as BaseIPC_CHANNELS,
  type IpcChannel as BaseIpcChannel,
} from '@clarityokr/contracts';

export const IPC_CHANNELS = BaseIPC_CHANNELS;
export type IpcChannel = BaseIpcChannel;

// Backward compatibility alias
export type RendererIpcChannel = IpcChannel;
