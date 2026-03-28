import type { OKRDocument, ManualEditRecord } from '@clarityokr/contracts';

/**
 * Database row structure for okr_documents table
 */
export interface DatabaseRow {
  id: string;
  objective: string;
  key_results: string;
  source_session_id: string;
  generated_at: string;
  last_edited_at: string | null;
  regeneration_policy: string;
  manual_edits: string;
}

/**
 * Repository interface for OKR document persistence operations
 */
export interface OKRRepository {
  save(okr: OKRDocument): Promise<void>;
  findById(okrId: string): Promise<OKRDocument | null>;
  findBySessionId(sessionId: string): Promise<OKRDocument[]>;
  getLatestForSession(sessionId: string): Promise<OKRDocument | null>;
  recordEdit(okrId: string, edit: ManualEditRecord): Promise<void>;
}
