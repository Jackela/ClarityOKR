import type { UserActionLogEntry } from '@clarityokr/contracts';

/**
 * Interface for writing user action logs to the database.
 * Records analytics events for user interactions with OKRs.
 *
 * @usage
 * ```typescript
 * const writer = new SQLiteActionLogWriter(databaseService);
 * await writer.logGenerate('session-123', 'okr-456', 'Improve team productivity');
 * ```
 */
export interface IActionLogWriter {
  /** Log a generate action when an OKR is first created */
  logGenerate(sessionId: string, okrId: string, objective: string): Promise<void>;

  /** Log a regenerate action when an OKR is regenerated */
  logRegenerate(sessionId: string, okrId: string, policy: 'overwrite' | 'append'): Promise<void>;

  /** Log an edit action when a user manually edits an OKR field */
  logEdit(sessionId: string, okrId: string, fieldPath: string): Promise<void>;

  /** Log a copy action when a user copies an OKR to clipboard */
  logCopy(sessionId: string, okrId: string): Promise<void>;

  /** Append a raw action log entry (legacy method for backward compatibility) */
  append(entry: UserActionLogEntry): Promise<void>;

  /** Get all action logs (legacy method for backward compatibility) */
  all(): Promise<UserActionLogEntry[]>;
}
