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
  save(okr: import('@clarityokr/contracts').OKRDocument): Promise<void>;
  findById(okrId: string): Promise<import('@clarityokr/contracts').OKRDocument | null>;
  findBySessionId(sessionId: string): Promise<import('@clarityokr/contracts').OKRDocument[]>;
  getLatestForSession(
    sessionId: string,
  ): Promise<import('@clarityokr/contracts').OKRDocument | null>;
  recordEdit(okrId: string, edit: import('@clarityokr/contracts').ManualEditRecord): Promise<void>;
}
