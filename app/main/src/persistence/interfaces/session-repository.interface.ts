import type { ClarificationSession } from '@clarityokr/contracts';

export interface ISessionRepository {
  save(session: ClarificationSession): Promise<void>;
  getById(id: string): Promise<ClarificationSession | null>;
  getAll(): Promise<ClarificationSession[]>;
  delete(id: string): Promise<void>;
  load(): Promise<{ session: ClarificationSession | null }>;
  saveSession(session: ClarificationSession | null): Promise<void>;
  getSession(sessionId: string): Promise<ClarificationSession | null>;
}
