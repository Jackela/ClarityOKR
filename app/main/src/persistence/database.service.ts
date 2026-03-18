import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import type { ClarificationSession, OKRDocument, UserActionLogEntry } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';

export interface DatabaseOptions {
  dataDir?: string;
  filename?: string;
}

export class DatabaseService {
  private db: BetterSqlite3.Database | null = null;
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
        selected_option_ids TEXT NOT NULL,
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
  getDb(): BetterSqlite3.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Save a session
   */
  saveSession(session: ClarificationSession): void {
    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO sessions 
      (id, initial_intent, status, created_at, updated_at, steps, selected_option_ids, confidence, pending_question_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.initialIntent,
      session.status,
      session.createdAt,
      session.updatedAt,
      JSON.stringify(session.steps),
      JSON.stringify(session.selectedOptionIds),
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
    const row = db
      .prepare(
        `
      SELECT id, initial_intent, status, created_at, updated_at, 
             steps, selected_option_ids, confidence, pending_question_id
      FROM sessions WHERE id = ?
    `,
      )
      .get(id) as
      | {
          id: string;
          initial_intent: string;
          status: string;
          created_at: string;
          updated_at: string;
          steps: string;
          selected_option_ids: string;
          confidence: number;
          pending_question_id: string | null;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      initialIntent: row.initial_intent,
      status: row.status as ClarificationSession['status'],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      steps: JSON.parse(row.steps),
      selectedOptionIds: JSON.parse(row.selected_option_ids),
      confidence: row.confidence,
      pendingQuestionId: row.pending_question_id,
    };
  }

  /**
   * Get all sessions
   */
  getAllSessions(): ClarificationSession[] {
    const db = this.getDb();
    const rows = db
      .prepare(
        `
      SELECT id, initial_intent, status, created_at, updated_at, 
             steps, selected_option_ids, confidence, pending_question_id
      FROM sessions ORDER BY created_at DESC
    `,
      )
      .all() as {
      id: string;
      initial_intent: string;
      status: string;
      created_at: string;
      updated_at: string;
      steps: string;
      selected_option_ids: string;
      confidence: number;
      pending_question_id: string | null;
    }[];

    return rows.map((row) => ({
      id: row.id,
      initialIntent: row.initial_intent,
      status: row.status as ClarificationSession['status'],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      steps: JSON.parse(row.steps),
      selectedOptionIds: JSON.parse(row.selected_option_ids),
      confidence: row.confidence,
      pendingQuestionId: row.pending_question_id,
    }));
  }

  /**
   * Delete a session
   */
  deleteSession(id: string): void {
    const db = this.getDb();
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    Logger.debug('[DatabaseService] Session deleted:', id);
  }

  /**
   * Save an OKR document
   */
  saveOKR(okr: OKRDocument): void {
    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO okr_documents 
      (id, objective, key_results, source_session_id, generated_at, last_edited_at, regeneration_policy, manual_edits)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

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
    const row = db
      .prepare(
        `
      SELECT id, objective, key_results, source_session_id, 
             generated_at, last_edited_at, regeneration_policy, manual_edits
      FROM okr_documents WHERE id = ?
    `,
      )
      .get(id) as
      | {
          id: string;
          objective: string;
          key_results: string;
          source_session_id: string;
          generated_at: string;
          last_edited_at: string | null;
          regeneration_policy: string;
          manual_edits: string;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      objective: row.objective,
      keyResults: JSON.parse(row.key_results),
      sourceSessionId: row.source_session_id,
      generatedAt: row.generated_at,
      lastEditedAt: row.last_edited_at,
      regenerationPolicy: row.regeneration_policy as OKRDocument['regenerationPolicy'],
      manualEdits: JSON.parse(row.manual_edits),
    };
  }

  /**
   * Get OKR by session ID
   */
  getOKRBySessionId(sessionId: string): OKRDocument | null {
    const db = this.getDb();
    const row = db
      .prepare(
        `
      SELECT id, objective, key_results, source_session_id, 
             generated_at, last_edited_at, regeneration_policy, manual_edits
      FROM okr_documents WHERE source_session_id = ?
    `,
      )
      .get(sessionId) as
      | {
          id: string;
          objective: string;
          key_results: string;
          source_session_id: string;
          generated_at: string;
          last_edited_at: string | null;
          regeneration_policy: string;
          manual_edits: string;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      objective: row.objective,
      keyResults: JSON.parse(row.key_results),
      sourceSessionId: row.source_session_id,
      generatedAt: row.generated_at,
      lastEditedAt: row.last_edited_at,
      regenerationPolicy: row.regeneration_policy as OKRDocument['regenerationPolicy'],
      manualEdits: JSON.parse(row.manual_edits),
    };
  }

  /**
   * Save an action log entry
   */
  saveActionLog(entry: UserActionLogEntry): void {
    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO action_logs 
      (id, action_type, session_id, okr_id, payload_summary, occurred_at)
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

    Logger.debug('[DatabaseService] Action log saved:', entry.id);
  }

  /**
   * Get action logs for a session
   */
  getActionLogs(sessionId: string): UserActionLogEntry[] {
    const db = this.getDb();
    const rows = db
      .prepare(
        `
      SELECT id, action_type, session_id, okr_id, payload_summary, occurred_at
      FROM action_logs WHERE session_id = ? ORDER BY occurred_at ASC
    `,
      )
      .all(sessionId) as {
      id: string;
      action_type: string;
      session_id: string;
      okr_id: string | null;
      payload_summary: string;
      occurred_at: string;
    }[];

    return rows.map((row) => ({
      id: row.id,
      actionType: row.action_type as UserActionLogEntry['actionType'],
      sessionId: row.session_id,
      okrId: row.okr_id,
      payloadSummary: row.payload_summary,
      occurredAt: row.occurred_at,
    }));
  }

  /**
   * Record migration
   */
  recordMigration(version: string, source?: string): void {
    const db = this.getDb();
    db.prepare(
      `
      INSERT INTO migrations (version, migrated_at, source)
      VALUES (?, ?, ?)
    `,
    ).run(version, new Date().toISOString(), source ?? null);

    Logger.info('[DatabaseService] Migration recorded:', version);
  }

  /**
   * Check if migration has been run
   */
  hasMigration(version: string): boolean {
    const db = this.getDb();
    const row = db.prepare('SELECT id FROM migrations WHERE version = ?').get(version);
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
