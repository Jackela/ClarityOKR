import type { Database } from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import { join } from 'node:path';

import type { ClarificationSession, OKRDocument, UserActionLogEntry } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { SessionRow, OKRRow, ActionLogRow } from './database.queries.js';
import { SQL_QUERIES, parseSessionRow, parseOKRRow, parseActionLogRow } from './database.queries.js';


export interface DatabaseOptions {
  dataDir?: string;
  filename?: string;
}

export class DatabaseService {
  private db: Database | null = null;
  private readonly dataDir: string;
  private readonly dbPath: string;

  constructor(options: DatabaseOptions = {}) {
    this.dataDir = options.dataDir ?? join(process.cwd(), 'data');
    this.dbPath = options.filename
      ? join(this.dataDir, options.filename)
      : join(this.dataDir, 'clarityokr.db');
  }

  /**
   * Initialize the database connection and create tables
   */
  initialize(): void {
    if (this.db) {
      return;
    }

    this.db = new BetterSqlite3(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.createTables();
    Logger.info('[DatabaseService] Database initialized at', this.dbPath);
  }

  /**
   * Create all required tables
   */
  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        initial_intent TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'collecting',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        steps TEXT NOT NULL,
        selected_options TEXT NOT NULL,
        confidence REAL NOT NULL,
        pending_question_id TEXT
      );
    `);

    // OKR documents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS okr_documents (
        id TEXT PRIMARY KEY,
        objective TEXT NOT NULL,
        key_results TEXT NOT NULL,
        source_session_id TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        last_edited_at TEXT,
        regeneration_policy TEXT NOT NULL,
        manual_edits TEXT NOT NULL
      );
    `);

    // Action logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS action_logs (
        id TEXT PRIMARY KEY,
        action_type TEXT NOT NULL,
        session_id TEXT NOT NULL,
        okr_id TEXT,
        payload_summary TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );
    `);

    // Migration tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        migrated_at TEXT NOT NULL,
        source TEXT
      );
    `);

    Logger.debug('[DatabaseService] Tables created');
  }

  /**
   * Get the database instance
   */
  getDb(): Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a function within a database transaction
   */
  transaction<T>(fn: () => T): T {
    const db = this.getDb();
    const tx = db.transaction(fn);
    return tx() as T;
  }

  /**
   * Save a session
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
   * Get a session by ID
   */
  getSession(id: string): ClarificationSession | null {
    const db = this.getDb();
    const row = db.prepare(SQL_QUERIES.getSession).get(id) as SessionRow | undefined;

    if (!row) return null;

    return parseSessionRow(row);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): ClarificationSession[] {
    const db = this.getDb();
    const rows = db.prepare(SQL_QUERIES.getAllSessions).all() as SessionRow[];

    return rows.map(parseSessionRow);
  }

  /**
   * Delete a session
   */
  deleteSession(id: string): void {
    const db = this.getDb();
    db.prepare(SQL_QUERIES.deleteSession).run(id);
    Logger.debug('[DatabaseService] Session deleted:', id);
  }

  /**
   * Save an OKR document
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
   * Get an OKR document by ID
   */
  getOKR(id: string): OKRDocument | null {
    const db = this.getDb();
    const row = db.prepare(SQL_QUERIES.getOKR).get(id) as OKRRow | undefined;

    if (!row) return null;

    return parseOKRRow(row);
  }

  /**
   * Get OKR by session ID
   */
  getOKRBySessionId(sessionId: string): OKRDocument | null {
    const db = this.getDb();
    const row = db.prepare(SQL_QUERIES.getOKRBySessionId).get(sessionId) as OKRRow | undefined;

    if (!row) return null;

    return parseOKRRow(row);
  }

  /**
   * Save an action log entry
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
   * Get action logs for a session
   */
  getActionLogs(sessionId: string): UserActionLogEntry[] {
    const db = this.getDb();
    const rows = db.prepare(SQL_QUERIES.getActionLogs).all(sessionId) as ActionLogRow[];

    return rows.map(parseActionLogRow);
  }

  /**
   * Record migration
   */
  recordMigration(version: string, source?: string): void {
    const db = this.getDb();
    db.prepare(SQL_QUERIES.recordMigration).run(version, new Date().toISOString(), source ?? null);

    Logger.info('[DatabaseService] Migration recorded:', version);
  }

  /**
   * Check if migration has been run
   */
  hasMigration(version: string): boolean {
    const db = this.getDb();
    const row = db.prepare(SQL_QUERIES.hasMigration).get(version);
    return !!row;
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      Logger.info('[DatabaseService] Database connection closed');
    }
  }
}
