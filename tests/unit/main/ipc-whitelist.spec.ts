import {
  ALLOWED_CHANNELS,
  IPC_CHANNELS,
  isAllowedChannel,
  validateChannel,
} from '@clarityokr/contracts';

describe('legacy notice and storage state IPC channels', () => {
  it('are in the allowlist and reachable through validateChannel', () => {
    for (const channel of [
      IPC_CHANNELS.LEGACY_NOTICE_GET,
      IPC_CHANNELS.LEGACY_NOTICE_ACK,
      IPC_CHANNELS.STORAGE_STATE_GET,
    ]) {
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

describe('closed-loop IPC channels (PR-C2)', () => {
  const channels = [
    ['OKR_LIST', 'clarityokr:okr:list'],
    ['OKR_OPEN', 'clarityokr:okr:open'],
    ['OKR_PIN', 'clarityokr:okr:pin'],
    ['OKR_SET_PERIOD', 'clarityokr:okr:set-period'],
    ['KR_SET_PROGRESS', 'clarityokr:kr:set-progress'],
    ['KR_REVERT_PROGRESS', 'clarityokr:kr:revert-progress'],
    ['KR_REPLACE_PROGRESS', 'clarityokr:kr:replace-progress'],
    ['REVIEW_GET', 'clarityokr:review:get'],
    ['REVIEW_SAVE', 'clarityokr:review:save'],
    ['EXPORT_SAVE', 'clarityokr:export:save'],
    ['EXPORT_REVEAL', 'clarityokr:export:reveal'],
    ['APP_RESTART', 'clarityokr:app:restart'],
  ] as const;

  it.each(channels)('%s is %s, allowlisted and reachable through validateChannel', (key, name) => {
    expect(IPC_CHANNELS[key]).toBe(name);
    expect(ALLOWED_CHANNELS).toContain(name);
    expect(isAllowedChannel(name)).toBe(true);
    expect(() => validateChannel(name)).not.toThrow();
  });

  it('look-alike channels are not allowlisted', () => {
    for (const bad of [
      'clarityokr:okr:delete',
      'clarityokr:export:save-all',
      'clarityokr:export:reveal:any',
      'clarityokr:app:quit',
      'clarityokr:kr:remove',
    ]) {
      expect(isAllowedChannel(bad)).toBe(false);
      expect(() => validateChannel(bad)).toThrow();
    }
  });
});

describe('window / wizard / unsaved-report channels (D1c)', () => {
  it.each([
    ['WINDOW_OPEN_WIZARD', 'clarityokr:window:open-wizard'],
    ['WIZARD_NEW_OKR', 'clarityokr:wizard:new-okr'],
    ['APP_REPORT_UNSAVED', 'clarityokr:app:report-unsaved'],
  ] as const)('%s is %s and allowlisted', (key, name) => {
    expect(IPC_CHANNELS[key]).toBe(name);
    expect(isAllowedChannel(name)).toBe(true);
    expect(() => validateChannel(name)).not.toThrow();
  });

  it('look-alikes are rejected', () => {
    for (const bad of [
      'clarityokr:window:open',
      'clarityokr:window:open-wizard:any',
      'clarityokr:app:report',
    ]) {
      expect(isAllowedChannel(bad)).toBe(false);
    }
  });
});
