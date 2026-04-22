import type { Database } from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';

import { Logger } from '../core/logger.js';

export interface ConnectionManagerOptions {
  dbPath: string;
}

/**
 * Manages SQLite database connections and schema initialization.
 * Follows SRP: handles ONLY connection lifecycle and schema creation.
 * All CRUD operations belong in repository classes.
 */
export class ConnectionManager {
  private db: Database | null = null;
  private readonly dbPath: string;

  constructor(options: ConnectionManagerOptions) {
    this.dbPath = options.dbPath;
  }

  /**
   * Open or return the existing database connection.
   * Configures WAL mode and foreign keys.
   */
  connect(): Database {
    if (this.db) {
      return this.db;
    }

    this.db = new BetterSqlite3(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    return this.db;
  }

  /**
   * Initialize the database connection and create all required tables.
   */
  initialize(): void {
    const db = this.connect();
    this.createTables(db);
    Logger.info('[ConnectionManager] Database initialized at', this.dbPath);
  }

  /**
   * Get the database instance.
   * @throws Error if database has not been initialized.
   */
  getDb(): Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a function within a database transaction.
   * Uses better-sqlite3 native transaction API.
   */
  transaction<T>(fn: () => T): T {
    const db = this.getDb();
    const tx = db.transaction(fn);
    return tx() as T;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      Logger.info('[ConnectionManager] Database connection closed');
    }
  }

  /**
   * Create all required tables.
   */
  private createTables(db: Database): void {
    // Sessions table
    db.exec(`
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
    db.exec(`
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
    db.exec(`
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
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        migrated_at TEXT NOT NULL,
        source TEXT
      );
    `);

    Logger.debug('[ConnectionManager] Tables created');
  }
}
