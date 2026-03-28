import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { UserActionLogEntry, UserActionType } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { DatabaseService } from './database.service.js';
import { ensureDataDir, readEncryptedJson, writeEncryptedJson } from './encrypted-persistence.js';

/** Maximum length for payload summary to prevent oversized log entries */
const MAX_PAYLOAD_SUMMARY_LENGTH = 120;

/** Default data directory for file-based persistence */
const DEFAULT_DATA_DIR = join(process.cwd(), 'data');

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
  /**
   * Log a generate action when an OKR is first created.
   *
   * @param sessionId - The clarification session ID
   * @param okrId - The generated OKR document ID
   * @param objective - The objective text (truncated to 120 chars)
   */
  logGenerate(sessionId: string, okrId: string, objective: string): Promise<void>;

  /**
   * Log a regenerate action when an OKR is regenerated.
   *
   * @param sessionId - The clarification session ID
   * @param okrId - The regenerated OKR document ID
   * @param policy - The regeneration policy ('overwrite' or 'append')
   */
  logRegenerate(sessionId: string, okrId: string, policy: 'overwrite' | 'append'): Promise<void>;

  /**
   * Log an edit action when a user manually edits an OKR field.
   *
   * @param sessionId - The clarification session ID
   * @param okrId - The edited OKR document ID
   * @param fieldPath - The path of the edited field (e.g., 'objective', 'keyResults[0].statement')
   */
  logEdit(sessionId: string, okrId: string, fieldPath: string): Promise<void>;

  /**
   * Log a copy action when a user copies an OKR to clipboard.
   *
   * @param sessionId - The clarification session ID
   * @param okrId - The copied OKR document ID
   */
  logCopy(sessionId: string, okrId: string): Promise<void>;

  /**
   * Append a raw action log entry (legacy method for backward compatibility).
   *
   * @param entry - The complete action log entry
   */
  append(entry: UserActionLogEntry): Promise<void>;

  /**
   * Get all action logs (legacy method for backward compatibility).
   *
   * @returns Array of all action log entries
   */
  all(): Promise<UserActionLogEntry[]>;
}

/**
 * SQLite-based implementation of ActionLogWriter.
 * Persists user action logs to the database for analytics and debugging.
 *
 * Table Schema:
 * ```sql
 * CREATE TABLE IF NOT EXISTS action_logs (
 *   id TEXT PRIMARY KEY,
 *   action_type TEXT NOT NULL,
 *   session_id TEXT NOT NULL,
 *   okr_id TEXT,
 *   payload_summary TEXT NOT NULL,
 *   occurred_at TEXT NOT NULL,
 *   FOREIGN KEY (session_id) REFERENCES clarification_sessions(id)
 * );
 * ```
 */
export class SQLiteActionLogWriter implements IActionLogWriter {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * @inheritDoc
   */
  async logGenerate(sessionId: string, okrId: string, objective: string): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'generate' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: this.truncatePayload(objective),
      occurredAt: new Date().toISOString(),
    };

    this.databaseService.saveActionLog(entry);
    Logger.debug('[SQLiteActionLogWriter] Logged generate action:', entry.id);
  }

  /**
   * @inheritDoc
   */
  async logRegenerate(
    sessionId: string,
    okrId: string,
    policy: 'overwrite' | 'append',
  ): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'regenerate' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: `policy:${policy}`,
      occurredAt: new Date().toISOString(),
    };

    this.databaseService.saveActionLog(entry);
    Logger.debug('[SQLiteActionLogWriter] Logged regenerate action:', entry.id);
  }

  /**
   * @inheritDoc
   */
  async logEdit(sessionId: string, okrId: string, fieldPath: string): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'edit' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: this.truncatePayload(fieldPath),
      occurredAt: new Date().toISOString(),
    };

    this.databaseService.saveActionLog(entry);
    Logger.debug('[SQLiteActionLogWriter] Logged edit action:', entry.id);
  }

  /**
   * @inheritDoc
   */
  async logCopy(sessionId: string, okrId: string): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'copy' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: 'copied to clipboard',
      occurredAt: new Date().toISOString(),
    };

    this.databaseService.saveActionLog(entry);
    Logger.debug('[SQLiteActionLogWriter] Logged copy action:', entry.id);
  }

  /**
   * Legacy method: Append a raw action log entry.
   * Directly saves the entry to the database.
   *
   * @param entry - The complete action log entry
   */
  async append(entry: UserActionLogEntry): Promise<void> {
    this.databaseService.saveActionLog(entry);
    Logger.debug('[SQLiteActionLogWriter] Appended action log:', entry.id);
  }

  /**
   * Legacy method: Get all action logs.
   * Note: This returns logs for all sessions. Use with caution.
   *
   * @returns Array of all action log entries
   */
  async all(): Promise<UserActionLogEntry[]> {
    // Get all logs by querying with an empty session filter
    // This is a workaround since getActionLogs requires a sessionId
    const db = this.databaseService.getDb();
    const rows = db
      .prepare(
        `
        SELECT id, action_type, session_id, okr_id, payload_summary, occurred_at
        FROM action_logs ORDER BY occurred_at ASC
      `,
      )
      .all() as {
      id: string;
      action_type: string;
      session_id: string;
      okr_id: string | null;
      payload_summary: string;
      occurred_at: string;
    }[];

    return rows.map((row) => ({
      id: row.id,
      actionType: row.action_type as UserActionType,
      sessionId: row.session_id,
      okrId: row.okr_id,
      payloadSummary: row.payload_summary,
      occurredAt: row.occurred_at,
    }));
  }

  /**
   * Truncate payload summary to maximum allowed length.
   *
   * @param payload - The raw payload string
   * @returns Truncated string (≤120 chars)
   */
  private truncatePayload(payload: string): string {
    if (payload.length <= MAX_PAYLOAD_SUMMARY_LENGTH) {
      return payload;
    }
    return payload.slice(0, MAX_PAYLOAD_SUMMARY_LENGTH - 3) + '...';
  }
}

/**
 * File-based implementation of ActionLogWriter using encrypted JSON.
 * @deprecated Use SQLiteActionLogWriter for new code
 */
export class FileActionLogWriter implements IActionLogWriter {
  private readonly dataDir: string;
  private readonly actionLogFile: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.actionLogFile = join(this.dataDir, 'action-log.json');
  }

  /**
   * @inheritDoc
   */
  async logGenerate(sessionId: string, okrId: string, objective: string): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'generate' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: objective.slice(0, MAX_PAYLOAD_SUMMARY_LENGTH),
      occurredAt: new Date().toISOString(),
    };
    await this.append(entry);
  }

  /**
   * @inheritDoc
   */
  async logRegenerate(
    sessionId: string,
    okrId: string,
    policy: 'overwrite' | 'append',
  ): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'regenerate' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: `policy:${policy}`,
      occurredAt: new Date().toISOString(),
    };
    await this.append(entry);
  }

  /**
   * @inheritDoc
   */
  async logEdit(sessionId: string, okrId: string, fieldPath: string): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'edit' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: fieldPath.slice(0, MAX_PAYLOAD_SUMMARY_LENGTH),
      occurredAt: new Date().toISOString(),
    };
    await this.append(entry);
  }

  /**
   * @inheritDoc
   */
  async logCopy(sessionId: string, okrId: string): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'copy' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: 'copied to clipboard',
      occurredAt: new Date().toISOString(),
    };
    await this.append(entry);
  }

  /**
   * Append a raw action log entry to the file.
   *
   * @param entry - The complete action log entry
   */
  async append(entry: UserActionLogEntry): Promise<void> {
    await ensureDataDir(this.dataDir);

    try {
      const current = (await readEncryptedJson<UserActionLogEntry[]>(this.actionLogFile)) ?? [];
      current.push(entry);
      await writeEncryptedJson(this.actionLogFile, current);
    } catch (error) {
      Logger.error('[FileActionLogWriter] Failed to append action log', error);
      throw error;
    }
  }

  /**
   * Get all action logs from the file.
   *
   * @returns Array of all action log entries
   */
  async all(): Promise<UserActionLogEntry[]> {
    await ensureDataDir(this.dataDir);

    try {
      return (await readEncryptedJson<UserActionLogEntry[]>(this.actionLogFile)) ?? [];
    } catch (error) {
      Logger.error('[FileActionLogWriter] Failed to read action logs', error);
      return [];
    }
  }
}

/**
 * Default ActionLogWriter implementation for backward compatibility.
 * Re-export of FileActionLogWriter as default class.
 * @deprecated Use SQLiteActionLogWriter for new code. This default will be removed in a future version.
 */
export { FileActionLogWriter as ActionLogWriter };
