import type {
  KeyResult,
  ManualEditRecord,
  OKRDocument,
  RegenerationPolicy,
} from '@clarityokr/contracts';
import { randomUUID } from 'crypto';

import type { DatabaseRow } from './okr-repository.types.js';

/**
 * Convert a database row to OKRDocument
 */
export function rowToDocument(row: DatabaseRow): OKRDocument {
  return {
    id: row.id,
    objective: row.objective,
    keyResults: JSON.parse(row.key_results) as KeyResult[],
    sourceSessionId: row.source_session_id,
    generatedAt: row.generated_at,
    lastEditedAt: row.last_edited_at,
    regenerationPolicy: row.regeneration_policy as RegenerationPolicy,
    manualEdits: JSON.parse(row.manual_edits) as ManualEditRecord[],
  };
}

/**
 * Detect changes between existing and new OKR documents
 */
export function detectChanges(existing: OKRDocument, updated: OKRDocument): ManualEditRecord[] {
  const edits: ManualEditRecord[] = [];
  const timestamp = new Date().toISOString();

  // Detect objective changes
  if (existing.objective !== updated.objective) {
    edits.push({
      id: randomUUID(),
      fieldPath: 'objective',
      previousValue: existing.objective,
      newValue: updated.objective,
      editedAt: timestamp,
    });
  }

  // Detect key results changes
  const existingKRs = new Map(existing.keyResults.map((kr) => [kr.id, kr]));
  const updatedKRs = new Map(updated.keyResults.map((kr) => [kr.id, kr]));

  // Check for modified or added key results
  for (const [id, updatedKR] of updatedKRs) {
    const existingKR = existingKRs.get(id);
    if (!existingKR) {
      edits.push({
        id: randomUUID(),
        fieldPath: `keyResults[${updated.keyResults.findIndex((kr) => kr.id === id)}]`,
        previousValue: '',
        newValue: JSON.stringify(updatedKR),
        editedAt: timestamp,
      });
    } else if (JSON.stringify(existingKR) !== JSON.stringify(updatedKR)) {
      edits.push({
        id: randomUUID(),
        fieldPath: `keyResults[${updated.keyResults.findIndex((kr) => kr.id === id)}]`,
        previousValue: JSON.stringify(existingKR),
        newValue: JSON.stringify(updatedKR),
        editedAt: timestamp,
      });
    }
  }

  // Check for removed key results
  for (const [id, existingKR] of existingKRs) {
    if (!updatedKRs.has(id)) {
      edits.push({
        id: randomUUID(),
        fieldPath: 'keyResults',
        previousValue: JSON.stringify(existingKR),
        newValue: '',
        editedAt: timestamp,
      });
    }
  }

  return edits;
}

/**
 * SQL queries for OKR repository
 */
export const OKR_QUERIES = {
  ensureTable: `
    CREATE TABLE IF NOT EXISTS okr_documents (
      id TEXT PRIMARY KEY,
      objective TEXT NOT NULL,
      key_results TEXT NOT NULL,
      source_session_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      last_edited_at TEXT,
      regeneration_policy TEXT DEFAULT 'overwrite',
      manual_edits TEXT DEFAULT '[]',
      FOREIGN KEY (source_session_id) REFERENCES clarification_sessions(id)
    );
  `,
  save: `
    INSERT OR REPLACE INTO okr_documents
    (id, objective, key_results, source_session_id, generated_at, last_edited_at, regeneration_policy, manual_edits)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  findById: `
    SELECT id, objective, key_results, source_session_id,
           generated_at, last_edited_at, regeneration_policy, manual_edits
    FROM okr_documents WHERE id = ?
  `,
  findBySessionId: `
    SELECT id, objective, key_results, source_session_id,
           generated_at, last_edited_at, regeneration_policy, manual_edits
    FROM okr_documents
    WHERE source_session_id = ?
    ORDER BY generated_at DESC
  `,
  getLatestForSession: `
    SELECT id, objective, key_results, source_session_id,
           generated_at, last_edited_at, regeneration_policy, manual_edits
    FROM okr_documents
    WHERE source_session_id = ?
    ORDER BY generated_at DESC
    LIMIT 1
  `,
  loadLatest: `
    SELECT id, objective, key_results, source_session_id,
           generated_at, last_edited_at, regeneration_policy, manual_edits
    FROM okr_documents
    ORDER BY generated_at DESC
    LIMIT 1
  `,
  recordEdit: `
    UPDATE okr_documents
    SET manual_edits = ?, last_edited_at = ?
    WHERE id = ?
  `,
};
