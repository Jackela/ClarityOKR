import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Database } from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';

import { Logger } from '../core/logger.js';
import { applySchema } from './okr-store/schema.js';

export interface ConnectionManagerOptions {
  dbPath: string;
  /** How long a locked database is waited for before SQLITE_BUSY (better-sqlite3 default: 5000). */
  busyTimeoutMs?: number;
}

/**
 * Manages SQLite database connections and schema initialization.
 * Follows SRP: handles ONLY connection lifecycle and schema creation.
 * All CRUD operations belong in repository classes.
 */
export class ConnectionManager {
  private db: Database | null = null;
  private readonly dbPath: string;
  private readonly busyTimeoutMs: number | undefined;

  constructor(options: ConnectionManagerOptions) {
    this.dbPath = options.dbPath;
    this.busyTimeoutMs = options.busyTimeoutMs;
  }

  /**
   * Open or return the existing database connection.
   * Configures WAL mode and foreign keys.
   */
  connect(): Database {
    if (this.db) {
      return this.db;
    }

    if (this.dbPath !== ':memory:') {
      mkdirSync(dirname(this.dbPath), { recursive: true });
    }
    this.db = new BetterSqlite3(
      this.dbPath,
      this.busyTimeoutMs === undefined ? undefined : { timeout: this.busyTimeoutMs },
    );
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    return this.db;
  }

  /**
   * Initialize the database connection and bring the schema up to date.
   */
  initialize(): void {
    const db = this.connect();
    applySchema(db);
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
}
