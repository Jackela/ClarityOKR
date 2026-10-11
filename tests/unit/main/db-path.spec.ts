import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DB_FILE_NAME, resolveDbPath } from '@clarityokr/main/startup/db-path';

describe('resolveDbPath', () => {
  let userData: string;
  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'okr-userdata-'));
  });
  afterEach(() => rmSync(userData, { recursive: true, force: true }));

  it('uses <userData>/clarityokr.db in production', () => {
    expect(resolveDbPath({ e2eTest: false, userDataDir: userData })).toBe(
      join(userData, DB_FILE_NAME),
    );
    expect(DB_FILE_NAME).toBe('clarityokr.db');
  });

  it('ignores E2E_DB_PATH unless E2E mode is on', () => {
    expect(
      resolveDbPath({ e2eTest: false, e2eDbPath: '/elsewhere/test.db', userDataDir: userData }),
    ).toBe(join(userData, DB_FILE_NAME));
  });

  it('honours E2E_DB_PATH in E2E mode', () => {
    expect(
      resolveDbPath({ e2eTest: true, e2eDbPath: '/elsewhere/test.db', userDataDir: userData }),
    ).toBe('/elsewhere/test.db');
  });

  it('falls back to userData in E2E mode when no path is given or it is empty', () => {
    expect(resolveDbPath({ e2eTest: true, userDataDir: userData })).toBe(
      join(userData, DB_FILE_NAME),
    );
    expect(resolveDbPath({ e2eTest: true, e2eDbPath: '', userDataDir: userData })).toBe(
      join(userData, DB_FILE_NAME),
    );
  });

  it('never resolves outside the given userData directory', () => {
    expect(resolveDbPath({ e2eTest: false, userDataDir: userData }).startsWith(userData)).toBe(
      true,
    );
  });
});
