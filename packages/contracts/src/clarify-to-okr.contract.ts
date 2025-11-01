/**
 * Shared interfaces for the Clarify-to-OKR Desktop Flow.
 * These definitions belong in @clarityokr/contracts and serve as the SSOT for
 * renderer, main process, and agent integrations.
 */

export type ClarificationStatus = 'collecting' | 'ready' | 'completed';

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

export interface ClarificationPromptRequest {
  sessionId: string;
  intent: string;
}

export interface ClarificationPromptResponse {
  prompt: ClarificationPrompt;
}

export interface ClarificationOptionSelection {
  sessionId: string;
  promptId: string;
  optionId: string;
}

export interface ClarificationSession {
  id: string;
  initialIntent: string;
  status: ClarificationStatus;
  createdAt: string;
  updatedAt: string;
  steps: ClarificationPrompt[];
  selectedOptionIds: string[];
  confidence: number;
  pendingQuestionId?: string | null;
}

export interface KeyResult {
  id: string;
  statement: string;
  successMetric?: string;
  owner?: string;
}

export type RegenerationPolicy = 'overwrite' | 'append';

export interface ManualEditRecord {
  id: string;
  fieldPath: string;
  previousValue: string;
  newValue: string;
  editedAt: string;
}

export interface OKRDocument {
  id: string;
  objective: string;
  keyResults: KeyResult[];
  sourceSessionId: string;
  generatedAt: string;
  lastEditedAt?: string | null;
  regenerationPolicy: RegenerationPolicy;
  manualEdits: ManualEditRecord[];
}

export type UserActionType = 'generate' | 'regenerate' | 'edit' | 'copy';

export interface UserActionLogEntry {
  id: string;
  actionType: UserActionType;
  sessionId: string;
  okrId?: string | null;
  payloadSummary: string;
  occurredAt: string;
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
  copiedAt: string;
}
