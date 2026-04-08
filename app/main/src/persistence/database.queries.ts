import type {
  ClarificationPrompt,
  ClarificationSession,
  OKRDocument,
  UserActionLogEntry,
} from '@clarityokr/contracts';

/**
 * Database row types for type-safe queries
 */
export interface SessionRow {
  id: string;
  initial_intent: string;
  status: string;
  created_at: string;
  updated_at: string;
  steps: string;
  selected_option_ids: string;
  confidence: number;
  pending_question_id: string | null;
}

export interface OKRRow {
  id: string;
  objective: string;
  key_results: string;
  source_session_id: string;
  generated_at: string;
  last_edited_at: string | null;
  regeneration_policy: string;
  manual_edits: string;
}

export interface ActionLogRow {
  id: string;
  action_type: string;
  session_id: string;
  okr_id: string | null;
  payload_summary: string;
  occurred_at: string;
}

/**
 * Parse session from database row
 */
export function parseSessionRow(row: SessionRow): ClarificationSession {
  return {
    id: row.id,
    initialIntent: row.initial_intent,
    status: row.status as ClarificationSession['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    steps: JSON.parse(row.steps) as ClarificationPrompt[],
    selectedOptionIds: JSON.parse(row.selected_option_ids) as string[],
    confidence: row.confidence,
    pendingQuestionId: row.pending_question_id,
  };
}

/**
 * Parse OKR from database row
 */
export function parseOKRRow(row: OKRRow): OKRDocument {
  return {
    id: row.id,
    objective: row.objective,
    keyResults: JSON.parse(row.key_results),
    sourceSessionId: row.source_session_id,
    generatedAt: row.generated_at,
    lastEditedAt: row.last_edited_at,
    regenerationPolicy: row.regeneration_policy as OKRDocument['regenerationPolicy'],
    manualEdits: JSON.parse(row.manual_edits),
  };
}

/**
 * Parse action log from database row
 */
export function parseActionLogRow(row: ActionLogRow): UserActionLogEntry {
  return {
    id: row.id,
    actionType: row.action_type as UserActionLogEntry['actionType'],
    sessionId: row.session_id,
    okrId: row.okr_id,
    payloadSummary: row.payload_summary,
    occurredAt: row.occurred_at,
  };
}

/**
 * SQL queries for database operations
 */
export const SQL_QUERIES = {
  saveSession: `
    INSERT OR REPLACE INTO sessions 
    (id, initial_intent, status, created_at, updated_at, steps, selected_option_ids, confidence, pending_question_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  getSession: `
    SELECT id, initial_intent, status, created_at, updated_at, 
           steps, selected_option_ids, confidence, pending_question_id
    FROM sessions WHERE id = ?
  `,
  getAllSessions: `
    SELECT id, initial_intent, status, created_at, updated_at, 
           steps, selected_option_ids, confidence, pending_question_id
    FROM sessions ORDER BY created_at DESC
  `,
  deleteSession: 'DELETE FROM sessions WHERE id = ?',
  saveOKR: `
    INSERT OR REPLACE INTO okr_documents 
    (id, objective, key_results, source_session_id, generated_at, last_edited_at, regeneration_policy, manual_edits)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  getOKR: `
    SELECT id, objective, key_results, source_session_id, 
           generated_at, last_edited_at, regeneration_policy, manual_edits
    FROM okr_documents WHERE id = ?
  `,
  getOKRBySessionId: `
    SELECT id, objective, key_results, source_session_id, 
           generated_at, last_edited_at, regeneration_policy, manual_edits
    FROM okr_documents WHERE source_session_id = ?
  `,
  saveActionLog: `
    INSERT OR REPLACE INTO action_logs 
    (id, action_type, session_id, okr_id, payload_summary, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  getActionLogs: `
    SELECT id, action_type, session_id, okr_id, payload_summary, occurred_at
    FROM action_logs WHERE session_id = ? ORDER BY occurred_at ASC
  `,
  recordMigration: `
    INSERT INTO migrations (version, migrated_at, source)
    VALUES (?, ?, ?)
  `,
  hasMigration: 'SELECT id FROM migrations WHERE version = ?',
};
