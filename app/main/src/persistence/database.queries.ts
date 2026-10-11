import type {
  ClarificationPrompt,
  ClarificationSelection,
  ClarificationSession,
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
  selected_options: string;
  confidence: number;
  pending_question_id: string | null;
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
    selectedOptions: JSON.parse(row.selected_options) as ClarificationSelection[],
    confidence: row.confidence,
    pendingQuestionId: row.pending_question_id,
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
    (id, initial_intent, status, created_at, updated_at, steps, selected_options, confidence, pending_question_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  getSession: `
    SELECT id, initial_intent, status, created_at, updated_at, 
           steps, selected_options, confidence, pending_question_id
    FROM sessions WHERE id = ?
  `,
  getAllSessions: `
    SELECT id, initial_intent, status, created_at, updated_at, 
           steps, selected_options, confidence, pending_question_id
    FROM sessions ORDER BY created_at DESC
  `,
  deleteSession: 'DELETE FROM sessions WHERE id = ?',
  saveActionLog: `
    INSERT OR REPLACE INTO action_logs 
    (id, action_type, session_id, okr_id, payload_summary, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  getActionLogs: `
    SELECT id, action_type, session_id, okr_id, payload_summary, occurred_at
    FROM action_logs WHERE session_id = ? ORDER BY occurred_at ASC
  `,
};
