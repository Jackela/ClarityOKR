import type { Database } from 'better-sqlite3';
import { join } from 'node:path';

import type { ClarificationSession, OKRDocument, UserActionLogEntry } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { SessionRow, OKRRow, ActionLogRow } from './database.queries.js';
import { SQL_QUERIES, parseSessionRow, parseOKRRow, parseActionLogRow } from './database.queries.js';
import { ConnectionManager } from './connection-manager.js';

export interface DatabaseOptions {
  dataDir?: string;
  filename?: string;
}

/**
 * Database service providing backward-compatible CRUD operations.
 * Connection management has been extracted to {@link ConnectionManager}.
 * @deprecated Direct CRUD methods are being moved to repository classes.
 * Use {@link SqliteSessionRepository}, {@link OKRRepositorySqlite}, etc.
 */
export class DatabaseService {
  private readonly connectionManager: ConnectionManager;

  constructor(options: DatabaseOptions = {}) {
    const dataDir = options.dataDir ?? join(process.cwd(), 'data');
    const dbPath = options.filename
      ? join(dataDir, options.filename)
      : join(dataDir, 'clarityokr.db');
    this.connectionManager = new ConnectionManager({ dbPath });
  }

  /**
   * Initialize the database connection and create tables.
   * Delegates to {@link ConnectionManager#initialize}.
   */
  initialize(): void {
    this.connectionManager.initialize();
  }

  /**
   * Get the database instance.
   * Delegates to {@link ConnectionManager#getDb}.
   */
  getDb(): Database {
    return this.connectionManager.getDb();
  }

  /**
   * Execute a function within a database transaction.
   * Delegates to {@link ConnectionManager#transaction}.
   */
  transaction<T>(fn: () => T): T {
    return this.connectionManager.transaction(fn);
  }

  /**
   * Close the database connection.
   * Delegates to {@link ConnectionManager#close}.
   */
  close(): void {
    this.connectionManager.close();
  }

  /**
   * Save a session.
   * @deprecated Use {@link SqliteSessionRepository#save} instead.
   */
  saveSession(session: ClarificationSession): void {
    const db = this.getDb();
    const stmt = db.prepare(SQL_QUERIES.saveSession);

    stmt.run(
      session.id,
      session.initialIntent,
      session.status,
      session.createdAt,
      session.updatedAt,
      JSON.stringify(session.steps),
      JSON.stringify(session.selectedOptions),
      session.confidence,
      session.pendingQuestionId ?? null,
    );

    Logger.debug('[DatabaseService] Session saved:', session.id);
  }

  /**
   * Get a session by ID.
   * @deprecated Use {@link SqliteSessionRepository#getById} instead.
   */
  getSession(id: string): ClarificationSession | null {
    const db = this.getDb();
    const row = db.prepare(SQL_QUERIES.getSession).get(id) as SessionRow | undefined;

    if (!row) return null;

    return parseSessionRow(row);
  }

  /**
   * Get all sessions.
   * @deprecated Use {@link SqliteSessionRepository#getAll} instead.
   */
  getAllSessions(): ClarificationSession[] {
    const db = this.getDb();
    const rows = db.prepare(SQL_QUERIES.getAllSessions).all() as SessionRow[];

    return rows.map(parseSessionRow);
  }

  /**
   * Delete a session.
   * @deprecated Use {@link SqliteSessionRepository#delete} instead.
   */
  deleteSession(id: string): void {
    const db = this.getDb();
    db.prepare(SQL_QUERIES.deleteSession).run(id);
    Logger.debug('[DatabaseService] Session deleted:', id);
  }

  /**
   * Save an OKR document.
   * @deprecated Use {@link OKRRepositorySqlite#save} instead.
   */
  saveOKR(okr: OKRDocument): void {
    const db = this.getDb();
    const stmt = db.prepare(SQL_QUERIES.saveOKR);

    stmt.run(
      okr.id,
      okr.objective,
      JSON.stringify(okr.keyResults),
      okr.sourceSessionId,
      okr.generatedAt,
      okr.lastEditedAt ?? null,
      okr.regenerationPolicy,
      JSON.stringify(okr.manualEdits),
    );

    Logger.debug('[DatabaseService] OKR saved:', okr.id);
  }

  /**
   * Get an OKR document by ID.
   * @deprecated Use {@link OKRRepositorySqlite#findById} instead.
   */
  getOKR(id: string): OKRDocument | null {
    const db = this.getDb();
    const row = db.prepare(SQL_QUERIES.getOKR).get(id) as OKRRow | undefined;

    if (!row) return null;

    return parseOKRRow(row);
  }

  /**
   * Get OKR by session ID.
   * @deprecated Use {@link OKRRepositorySqlite#findBySessionId} instead.
   */
  getOKRBySessionId(sessionId: string): OKRDocument | null {
    const db = this.getDb();
    const row = db.prepare(SQL_QUERIES.getOKRBySessionId).get(sessionId) as OKRRow | undefined;

    if (!row) return null;

    return parseOKRRow(row);
  }

  /**
   * Save an action log entry.
   * @deprecated Use {@link SQLiteActionLogWriter#append} instead.
   */
  saveActionLog(entry: UserActionLogEntry): void {
    const db = this.getDb();
    const stmt = db.prepare(SQL_QUERIES.saveActionLog);

    stmt.run(
      entry.id,
      entry.actionType,
      entry.sessionId,
      entry.okrId ?? null,
      entry.payloadSummary,
      entry.occurredAt,
    );

    Logger.debug('[DatabaseService] Action log saved:', entry.id);
  }

  /**
   * Get action logs for a session.
   * @deprecated Use {@link SQLiteActionLogWriter} instead.
   */
  getActionLogs(sessionId: string): UserActionLogEntry[] {
    const db = this.getDb();
    const rows = db.prepare(SQL_QUERIES.getActionLogs).all(sessionId) as ActionLogRow[];

    return rows.map(parseActionLogRow);
  }

  /**
   * Record migration.
   * @deprecated Use {@link MigrationService} instead.
   */
  recordMigration(version: string, source?: string): void {
    const db = this.getDb();
    db.prepare(SQL_QUERIES.recordMigration).run(version, new Date().toISOString(), source ?? null);

    Logger.info('[DatabaseService] Migration recorded:', version);
  }

  /**
   * Check if migration has been run.
   * @deprecated Use {@link MigrationService} instead.
   */
  hasMigration(version: string): boolean {
    const db = this.getDb();
    const row = db.prepare(SQL_QUERIES.hasMigration).get(version);
    return !!row;
  }
}
