import {
  IPC_CHANNELS as BaseIPC_CHANNELS,
  type IpcChannel as BaseIpcChannel,
  type IpcChannelKey as BaseIpcChannelKey,
} from '@clarityokr/contracts';

export const IPC_CHANNELS = BaseIPC_CHANNELS;
export type IpcChannel = BaseIpcChannel;
export type IpcChannelKey = BaseIpcChannelKey;

// Backward compatibility alias
export const IPCChannels = IPC_CHANNELS;
