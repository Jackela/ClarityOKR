import {
  ALLOWED_CHANNELS,
  IPC_CHANNELS,
  isAllowedChannel,
  validateChannel,
} from '@clarityokr/contracts';

describe('legacy notice IPC channels', () => {
  it('are in the allowlist and reachable through validateChannel', () => {
    for (const channel of [IPC_CHANNELS.LEGACY_NOTICE_GET, IPC_CHANNELS.LEGACY_NOTICE_ACK]) {
      expect(ALLOWED_CHANNELS).toContain(channel);
      expect(isAllowedChannel(channel)).toBe(true);
      expect(() => validateChannel(channel)).not.toThrow();
    }
  });

  it('every IPC_CHANNELS value is allowlisted and nothing unknown is', () => {
    expect([...ALLOWED_CHANNELS].sort()).toEqual(Object.values(IPC_CHANNELS).sort());
    expect(isAllowedChannel('clarityokr:app:legacy-notice:path')).toBe(false);
  });
});
