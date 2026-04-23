import type { ClarificationSession } from '@clarityokr/contracts';

import { SQL_QUERIES, parseSessionRow } from './database.queries.js';
import type { ConnectionManager } from './connection-manager.js';
import type { ISessionRepository } from './interfaces/session-repository.interface.js';

export class SqliteSessionRepository implements ISessionRepository {
  constructor(private readonly connectionManager: ConnectionManager) {}

  async save(session: ClarificationSession): Promise<void> {
    const db = this.connectionManager.getDb();
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
  }

  async getById(id: string): Promise<ClarificationSession | null> {
    const db = this.connectionManager.getDb();
    const row = db.prepare(SQL_QUERIES.getSession).get(id) as
      | { id: string; initial_intent: string; status: string; created_at: string; updated_at: string; steps: string; selected_options: string; confidence: number; pending_question_id: string | null }
      | undefined;

    if (!row) return null;

    return parseSessionRow(row);
  }

  async getAll(): Promise<ClarificationSession[]> {
    const db = this.connectionManager.getDb();
    const rows = db.prepare(SQL_QUERIES.getAllSessions).all() as
      Array<{ id: string; initial_intent: string; status: string; created_at: string; updated_at: string; steps: string; selected_options: string; confidence: number; pending_question_id: string | null }>;

    return rows.map(parseSessionRow);
  }

  async delete(id: string): Promise<void> {
    const db = this.connectionManager.getDb();
    db.prepare(SQL_QUERIES.deleteSession).run(id);
  }

  /**
   * @deprecated Use getAll() instead. This method loads all sessions and returns the first one.
   */
  async load(): Promise<{ session: ClarificationSession | null }> {
    const sessions = await this.getAll();
    return {
      session: sessions[0] ?? null,
    };
  }

  /**
   * @deprecated Use save() instead. This is an alias that delegates to save().
   */
  async saveSession(session: ClarificationSession | null): Promise<void> {
    if (!session || !session.id) {
      return;
    }
    await this.save(session);
  }

  /**
   * @deprecated Use getById() instead. This is an alias that delegates to getById().
   */
  async getSession(sessionId: string): Promise<ClarificationSession | null> {
    return this.getById(sessionId);
  }
}
