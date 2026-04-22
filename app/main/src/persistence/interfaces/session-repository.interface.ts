import type { ClarificationSession } from '@clarityokr/contracts';

export interface ISessionRepository {
  save(session: ClarificationSession): Promise<void>;
  getById(id: string): Promise<ClarificationSession | null>;
  getAll(): Promise<ClarificationSession[]>;
  delete(id: string): Promise<void>;
}
