/**
 * Shared interfaces for the Clarify-to-OKR Desktop Flow.
 * These definitions belong in @clarityokr/contracts and serve as the SSOT for
 * renderer, main process, and agent integrations.
 */

export type ClarificationStatus = "collecting" | "ready" | "completed";

export interface ClarificationOption {
  id: string;
  label: string;
  description?: string;
  scopeTag: string;
}

export interface ClarificationPrompt {
  id: string;
  question: string;
  sequence: number;
  context: string;
  options: ClarificationOption[]; // MUST contain 2-5 entries
}

export interface ClarificationSession {
  id: string;
  initialIntent: string;
  status: ClarificationStatus;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  steps: ClarificationPrompt[];
  selectedOptionIds: string[];
  confidence: number; // 0-1 range
  pendingQuestionId?: string | null;
}

export interface KeyResult {
  id: string;
  statement: string;
  successMetric?: string;
  owner?: string;
}

export type RegenerationPolicy = "overwrite" | "append";

export interface ManualEditRecord {
  id: string;
  fieldPath: string;
  previousValue: string;
  newValue: string;
  editedAt: string; // ISO timestamp
}

export interface OKRDocument {
  id: string;
  objective: string;
  keyResults: KeyResult[];
  sourceSessionId: string;
  generatedAt: string; // ISO timestamp
  lastEditedAt?: string | null; // ISO timestamp
  regenerationPolicy: RegenerationPolicy;
  manualEdits: ManualEditRecord[];
}

export type UserActionType = "generate" | "regenerate" | "edit" | "copy";

export interface UserActionLogEntry {
  id: string;
  actionType: UserActionType;
  sessionId: string;
  okrId?: string | null;
  payloadSummary: string;
  occurredAt: string; // ISO timestamp
}

export interface GenerateOKRRequest {
  sessionId: string;
  intentSummary: string;
}

export interface GenerateOKRResponse {
  okr: OKRDocument;
  session: ClarificationSession;
}

export interface RegenerateOKRRequest {
  sessionId: string;
  policy: RegenerationPolicy;
}

export interface RegenerateOKRResponse {
  okr: OKRDocument;
  session: ClarificationSession;
}

export interface PersistClarificationRequest {
  session: ClarificationSession;
  okr?: OKRDocument | null;
}

export interface ClipboardExportRequest {
  okrId: string;
}

export interface ClipboardExportResult {
  okrMarkdown: string;
  copiedAt: string; // ISO timestamp
}
