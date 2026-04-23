import { randomUUID } from 'node:crypto';

import type { UserActionLogEntry, UserActionType } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { ConnectionManager } from './connection-manager.js';
import type { IActionLogWriter } from './action-log-writer.interface.js';

const MAX_PAYLOAD_SUMMARY_LENGTH = 120;

/**
 * SQLite-based implementation of ActionLogWriter.
 * Persists user action logs to the database for analytics and debugging.
 */
export class SQLiteActionLogWriter implements IActionLogWriter {
  constructor(private readonly connectionManager: ConnectionManager) {}

  async logGenerate(sessionId: string, okrId: string, objective: string): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'generate' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: this.truncatePayload(objective),
      occurredAt: new Date().toISOString(),
    };

    this.saveActionLog(entry);
    Logger.debug('[SQLiteActionLogWriter] Logged generate action:', entry.id);
  }

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

    this.saveActionLog(entry);
    Logger.debug('[SQLiteActionLogWriter] Logged regenerate action:', entry.id);
  }

  async logEdit(sessionId: string, okrId: string, fieldPath: string): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'edit' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: this.truncatePayload(fieldPath),
      occurredAt: new Date().toISOString(),
    };

    this.saveActionLog(entry);
    Logger.debug('[SQLiteActionLogWriter] Logged edit action:', entry.id);
  }

  async logCopy(sessionId: string, okrId: string): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'copy' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: 'copied to clipboard',
      occurredAt: new Date().toISOString(),
    };

    this.saveActionLog(entry);
    Logger.debug('[SQLiteActionLogWriter] Logged copy action:', entry.id);
  }

  async append(entry: UserActionLogEntry): Promise<void> {
    this.saveActionLog(entry);
    Logger.debug('[SQLiteActionLogWriter] Appended action log:', entry.id);
  }

  async all(): Promise<UserActionLogEntry[]> {
    const db = this.connectionManager.getDb();
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

  private saveActionLog(entry: UserActionLogEntry): void {
    const db = this.connectionManager.getDb();
    const stmt = db.prepare(`
      INSERT INTO action_logs (id, action_type, session_id, okr_id, payload_summary, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      entry.actionType,
      entry.sessionId,
      entry.okrId ?? null,
      entry.payloadSummary,
      entry.occurredAt,
    );
  }

  private truncatePayload(payload: string): string {
    if (payload.length <= MAX_PAYLOAD_SUMMARY_LENGTH) {
      return payload;
    }
    return payload.slice(0, MAX_PAYLOAD_SUMMARY_LENGTH - 3) + '...';
  }
}
