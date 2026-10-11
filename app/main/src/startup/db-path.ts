import { join } from 'node:path';

export interface DbPathInput {
  /** True when running under the E2E harness (E2E_TEST is set). */
  e2eTest: boolean;
  /** Explicit database path, honoured only in E2E mode. */
  e2eDbPath?: string | undefined;
  /** Electron `app.getPath('userData')`. */
  userDataDir: string;
}

export const DB_FILE_NAME = 'clarityokr.db';

/** The E2E harness may pin the database path; otherwise it lives in the per-user data directory. */
export function resolveDbPath(input: DbPathInput): string {
  if (input.e2eTest && input.e2eDbPath) {
    return input.e2eDbPath;
  }
  return join(input.userDataDir, DB_FILE_NAME);
}
