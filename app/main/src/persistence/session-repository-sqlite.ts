import type { ClarificationSession, OKRDocument, UserActionLogEntry } from '@clarityokr/contracts';

import { DatabaseService } from './database.service.js';
import { MigrationService, type MigrationResult } from './migration.service.js';

export interface PersistedState {
  session: ClarificationSession | null;
  okr: OKRDocument | null;
  actions: UserActionLogEntry[];
}

export interface MultiSessionState {
  sessions: Record<string, ClarificationSession>;
  okrs: Record<string, OKRDocument>;
  actions: Record<string, UserActionLogEntry[]>;
  activeSessionId: string | null;
}

/**
 * SessionRepository with SQLite backend
 * Provides persistence for sessions, OKRs, and action logs
 */
export class SessionRepository {
  private readonly db: DatabaseService;
  private readonly migrationService: MigrationService;

  constructor(dataDir?: string) {
    this.db = new DatabaseService({ dataDir });
    this.migrationService = new MigrationService(dataDir);

    // Initialize database and run migrations
    this.db.initialize();
  }

  /**
   * Check and run migration from JSON if needed
   */
  async migrateFromJson(): Promise<MigrationResult> {
    if (this.migrationService.needsMigration()) {
      return this.migrationService.migrate();
    }

    return {
      success: true,
      sessionsMigrated: 0,
      okrsMigrated: 0,
      actionsMigrated: 0,
      errors: [],
    };
  }

  /**
   * Get migration status
   */
  getMigrationStatus() {
    return this.migrationService.getMigrationStatus();
  }

  /**
   * Load single session state (legacy compatibility)
   */
  load(): PersistedState {
    const sessions = this.db.getAllSessions();
    const session = sessions[0] ?? null;

    let okr: OKRDocument | null = null;
    let actions: UserActionLogEntry[] = [];

    if (session) {
      okr = this.db.getOKRBySessionId(session.id);
      actions = this.db.getActionLogs(session.id);
    }

    return { session, okr, actions };
  }

  /**
   * Save session
   */
  saveSession(session: ClarificationSession | null): void {
    if (session) {
      this.db.saveSession(session);
    }
  }

  /**
   * Save OKR document
   */
  saveOKRDocument(document: OKRDocument | null): void {
    if (document) {
      this.db.saveOKR(document);
    }
  }

  /**
   * Append action log entry
   */
  appendActionLog(entry: UserActionLogEntry): void {
    this.db.saveActionLog(entry);
  }

  /**
   * Replace action logs for a session
   */
  replaceActionLog(_entries: UserActionLogEntry[]): void {
    // In SQLite, we just append - no need to replace entire log
    // This method exists for API compatibility
  }

  // ========== Multi-session support ==========

  /**
   * Load all sessions state
   */
  loadMultiSessionState(): MultiSessionState {
    const sessions = this.db.getAllSessions();

    const sessionsRecord: Record<string, ClarificationSession> = {};
    const okrsRecord: Record<string, OKRDocument> = {};
    const actionsRecord: Record<string, UserActionLogEntry[]> = {};

    for (const session of sessions) {
      sessionsRecord[session.id] = session;

      const okr = this.db.getOKRBySessionId(session.id);
      if (okr) {
        okrsRecord[session.id] = okr;
      }

      actionsRecord[session.id] = this.db.getActionLogs(session.id);
    }

    return {
      sessions: sessionsRecord,
      okrs: okrsRecord,
      actions: actionsRecord,
      activeSessionId: sessions.length > 0 ? sessions[0].id : null,
    };
  }

  /**
   * Save multi-session state
   */
  saveMultiSessionState(state: MultiSessionState): void {
    // Save all sessions
    for (const session of Object.values(state.sessions)) {
      this.db.saveSession(session);
    }

    // Save all OKRs
    for (const okr of Object.values(state.okrs)) {
      this.db.saveOKR(okr);
    }

    // Save all action logs
    for (const entries of Object.values(state.actions)) {
      for (const entry of entries) {
        this.db.saveActionLog(entry);
      }
    }
  }

  /**
   * Get specific session
   */
  getSession(sessionId: string): ClarificationSession | null {
    return this.db.getSession(sessionId);
  }

  /**
   * Save session (multi-session API)
   */
  saveSessionMulti(session: ClarificationSession): void {
    this.db.saveSession(session);
  }

  /**
   * Get OKR for specific session
   */
  getOKR(sessionId: string): OKRDocument | null {
    return this.db.getOKRBySessionId(sessionId);
  }

  /**
   * Save OKR (multi-session API)
   */
  saveOKRMulti(_sessionId: string, okr: OKRDocument): void {
    this.db.saveOKR(okr);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): ClarificationSession[] {
    return this.db.getAllSessions();
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): void {
    this.db.deleteSession(sessionId);
  }

  /**
   * Set active session (for compatibility, SQLite handles this automatically)
   */
  setActiveSession(_sessionId: string): void {
    // In SQLite, we don't need to track active session separately
    // The most recently updated session is considered active
  }

  /**
   * Get active session ID
   */
  getActiveSessionId(): string | null {
    const sessions = this.db.getAllSessions();
    return sessions.length > 0 ? sessions[0].id : null;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
