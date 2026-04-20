import type { ClarificationSession } from '@clarityokr/contracts';

import type { DatabaseService } from './database.service.js';
import type { ISessionRepository } from './interfaces/session-repository.interface.js';

export class SqliteSessionRepository implements ISessionRepository {
  constructor(private readonly db: DatabaseService) {}

  async save(session: ClarificationSession): Promise<void> {
    this.db.saveSession(session);
  }

  async getById(id: string): Promise<ClarificationSession | null> {
    return this.db.getSession(id);
  }

  async getAll(): Promise<ClarificationSession[]> {
    return this.db.getAllSessions();
  }

  async delete(id: string): Promise<void> {
    this.db.deleteSession(id);
  }

  async load(): Promise<{ session: ClarificationSession | null }> {
    const sessions = await this.getAll();
    return {
      session: sessions[0] ?? null,
    };
  }

  async saveSession(session: ClarificationSession | null): Promise<void> {
    if (!session || !session.id) {
      return;
    }
    await this.save(session);
  }

  async getSession(sessionId: string): Promise<ClarificationSession | null> {
    return this.getById(sessionId);
  }
}
