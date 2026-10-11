import {
  IntegrityCheckError,
  isCorruptionError,
} from '@clarityokr/main/persistence/okr-store/db-errors';

const withCode = (code: string): Error => Object.assign(new Error(code), { code });

describe('isCorruptionError', () => {
  it.each(['SQLITE_CORRUPT', 'SQLITE_CORRUPT_VTAB', 'SQLITE_CORRUPT_INDEX', 'SQLITE_NOTADB'])(
    'treats %s as corruption',
    (code) => {
      expect(isCorruptionError(withCode(code))).toBe(true);
    },
  );

  it('treats a failed integrity check as corruption', () => {
    expect(isCorruptionError(new IntegrityCheckError('*** in database main ***'))).toBe(true);
  });

  it.each([
    'SQLITE_BUSY',
    'SQLITE_BUSY_SNAPSHOT',
    'SQLITE_LOCKED',
    'SQLITE_IOERR',
    'SQLITE_IOERR_SHORT_READ',
    'SQLITE_CANTOPEN',
    'SQLITE_PERM',
    'SQLITE_READONLY',
    'SQLITE_AUTH',
    'SQLITE_FULL',
    'EBUSY',
    'EPERM',
    'EACCES',
  ])('never treats %s as corruption', (code) => {
    expect(isCorruptionError(withCode(code))).toBe(false);
  });

  it('is false for plain errors and non-errors', () => {
    expect(isCorruptionError(new Error('boom'))).toBe(false);
    expect(isCorruptionError(undefined)).toBe(false);
    expect(isCorruptionError('SQLITE_CORRUPT')).toBe(false);
  });
});
