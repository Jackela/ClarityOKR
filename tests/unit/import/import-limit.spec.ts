import {
  BYTES_PER_MB,
  IMPORT_BACKUP_MAX_BYTES,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_MB,
  exceedsBackupLimit,
  exceedsImportLimit,
} from '@clarityokr/contracts';

/** #89: one definition of the import limits, and their boundaries. */
describe('#89 import size limit', () => {
  it('the single-OKR limit is 5 × 1024 × 1024 bytes, defined once from IMPORT_MAX_MB', () => {
    expect(BYTES_PER_MB).toBe(1024 * 1024);
    expect(IMPORT_MAX_MB).toBe(5);
    expect(IMPORT_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(IMPORT_BACKUP_MAX_BYTES).toBe(50 * 1024 * 1024);
  });

  it('exactly the limit is allowed', () => {
    expect(exceedsImportLimit(IMPORT_MAX_BYTES)).toBe(false);
    expect(exceedsImportLimit(IMPORT_MAX_BYTES - 1)).toBe(false);
    expect(exceedsImportLimit(0)).toBe(false);
  });

  it('one byte over the limit is too large', () => {
    expect(exceedsImportLimit(IMPORT_MAX_BYTES + 1)).toBe(true);
  });

  it('backup limit: exactly 50 MB allowed, one byte more is not', () => {
    expect(exceedsBackupLimit(IMPORT_BACKUP_MAX_BYTES)).toBe(false);
    expect(exceedsBackupLimit(IMPORT_BACKUP_MAX_BYTES + 1)).toBe(true);
  });
});
