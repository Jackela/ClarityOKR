import type { Database } from 'better-sqlite3';

/**
 * Forward-only schema migrations keyed by `PRAGMA user_version`.
 * Each step runs inside a transaction together with its version bump, so a
 * failure leaves the database at the previous version.
 */
export const SCHEMA_MIGRATIONS: readonly string[] = [
  // v1
  `
  CREATE TABLE sessions (
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

  CREATE TABLE objectives (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    period TEXT CHECK (period IS NULL OR period GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]'),
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    source_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_objectives_single_pinned ON objectives (pinned) WHERE pinned = 1;
  CREATE INDEX idx_objectives_updated_at ON objectives (updated_at DESC);

  CREATE TABLE key_results (
    id TEXT PRIMARY KEY,
    objective_id TEXT NOT NULL REFERENCES objectives (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    statement TEXT NOT NULL,
    success_metric TEXT,
    progress INTEGER CHECK (progress IS NULL OR (progress BETWEEN 0 AND 100)),
    status TEXT NOT NULL DEFAULT 'not_started'
      CHECK (status IN ('not_started', 'in_progress', 'at_risk', 'done')),
    removed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_key_results_objective ON key_results (objective_id, position);

  CREATE TABLE progress_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kr_id TEXT NOT NULL REFERENCES key_results (id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('set', 'revert')),
    value INTEGER CHECK (value IS NULL OR (value BETWEEN 0 AND 100)),
    status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'at_risk', 'done')),
    reverts_entry_id INTEGER REFERENCES progress_entries (id),
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX idx_progress_entries_kr ON progress_entries (kr_id, id);

  CREATE TABLE reviews (
    objective_id TEXT PRIMARY KEY REFERENCES objectives (id) ON DELETE CASCADE,
    went_well TEXT NOT NULL,
    fell_short TEXT NOT NULL,
    next_steps TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    saved_at TEXT NOT NULL
  );

  CREATE TABLE action_logs (
    id TEXT PRIMARY KEY,
    action_type TEXT NOT NULL,
    session_id TEXT NOT NULL,
    okr_id TEXT,
    payload_summary TEXT NOT NULL,
    occurred_at TEXT NOT NULL
  );
  `,
  // v2: the review snapshot is frozen by the first save only; saved_at follows later text edits.
  `
  ALTER TABLE reviews ADD COLUMN snapshot_at TEXT NOT NULL DEFAULT '';
  UPDATE reviews SET snapshot_at = saved_at;
  `,
];

export const LATEST_SCHEMA_VERSION = SCHEMA_MIGRATIONS.length;

export class SchemaVersionError extends Error {
  constructor(
    readonly found: number,
    readonly supported: number,
  ) {
    super(`Database schema version ${found} is newer than supported version ${supported}`);
    this.name = 'SchemaVersionError';
  }
}

export function getSchemaVersion(db: Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/**
 * Brings the database up to the latest schema. Safe to call repeatedly.
 * Enables foreign keys on the connection (SQLite leaves them off by default).
 */
export function applySchema(db: Database): number {
  db.pragma('foreign_keys = ON');
  const current = getSchemaVersion(db);
  if (current > LATEST_SCHEMA_VERSION) {
    throw new SchemaVersionError(current, LATEST_SCHEMA_VERSION);
  }
  for (let version = current; version < LATEST_SCHEMA_VERSION; version += 1) {
    const sql = SCHEMA_MIGRATIONS[version] as string;
    const step = db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version + 1}`);
    });
    step();
  }
  return LATEST_SCHEMA_VERSION;
}
