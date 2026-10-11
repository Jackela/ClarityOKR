/** The integrity check of an opened database did not return "ok". */
export class IntegrityCheckError extends Error {
  constructor(readonly detail: string) {
    super(`Database integrity check failed: ${detail}`);
    this.name = 'IntegrityCheckError';
  }
}

export function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}

/**
 * True only for positive evidence that the file's content is damaged or is not a SQLite
 * database (SQLITE_CORRUPT*, SQLITE_NOTADB, or a failed integrity check). Busy, locked,
 * I/O, cannot-open and permission errors say nothing about the content and must never be
 * a reason to move a database away.
 */
export function isCorruptionError(error: unknown): boolean {
  if (error instanceof IntegrityCheckError) {
    return true;
  }
  const code = errorCode(error);
  return code.startsWith('SQLITE_CORRUPT') || code === 'SQLITE_NOTADB';
}
