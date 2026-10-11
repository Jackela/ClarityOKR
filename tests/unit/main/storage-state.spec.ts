import { jest } from '@jest/globals';
import { IPC_CHANNELS } from '@clarityokr/contracts';

import { registerStorageStateHandler } from '@clarityokr/main/startup/storage-state';

describe('registerStorageStateHandler', () => {
  it.each(['normal', 'fresh-file', 'memory'] as const)(
    'replies with the storage mode "%s" and nothing else, ignoring payloads',
    (mode) => {
      const handle = jest.fn();
      registerStorageStateHandler({ handle } as never, mode);
      expect(handle).toHaveBeenCalledTimes(1);
      expect(handle.mock.calls[0]![0]).toBe(IPC_CHANNELS.STORAGE_STATE_GET);
      const handler = handle.mock.calls[0]![1] as (...args: unknown[]) => unknown;
      expect(handler({}, { path: '/etc/passwd' })).toEqual({ storageMode: mode });
    },
  );
});
