/**
 * Shared interfaces for the Clarify-to-OKR Desktop Flow.
 * These definitions belong in @clarityokr/contracts and serve as the SSOT for
 * renderer, main process, and agent integrations.
 */

/** Current status of a clarification session */
export type ClarificationStatus = 'collecting' | 'ready' | 'completed';

/**
 * A single option presented to the user during clarification.
 */
export interface ClarificationOption {
  /** Unique identifier for this option */
  id: string;
  /** Display text shown to the user */
  label: string;
  /** Optional additional context explaining this option */
  description?: string;
  /** Category tag for grouping (e.g., 'dimension', 'detail') */
  scopeTag: string;
}

/**
 * A single question prompt in the clarification flow.
 */
export interface ClarificationPrompt {
  /** Unique identifier for this prompt */
  id: string;
  /** The question text presented to the user */
  question: string;
  /** Order of this prompt in the sequence (0-based) */
  sequence: number;
  /** Additional context or explanation for the question */
  context: string;
  /** Available options for the user to choose from (MUST contain 2-5 entries) */
  options: ClarificationOption[];
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

/**
 * Represents a complete clarification session with all prompts and selections.
 */
export interface ClarificationSession {
  /** Unique identifier for this session */
  id: string;
  /** The user's original input or goal description */
  initialIntent: string;
  /** Current lifecycle status of the session */
  status: ClarificationStatus;
  /** ISO timestamp when the session was created */
  createdAt: string;
  /** ISO timestamp when the session was last updated */
  updatedAt: string;
  /** All prompts that have been or will be presented in this session */
  steps: ClarificationPrompt[];
  /** IDs of options the user has selected so far */
  selectedOptionIds: string[];
  /** Confidence score (0-1) indicating how well the intent is understood */
  confidence: number;
  /** ID of the next prompt awaiting user response, if any */
  pendingQuestionId?: string | null;
}

/**
 * A measurable key result under an objective.
 */
export interface KeyResult {
  /** Unique identifier for this key result */
  id: string;
  /** The key result statement describing what will be achieved */
  statement: string;
  /** How success will be measured (e.g., "Increase from 10% to 25%") */
  successMetric?: string;
  /** Person responsible for this key result */
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

/**
 * A complete OKR document with objective, key results, and metadata.
 */
export interface OKRDocument {
  /** Unique identifier for this OKR document */
  id: string;
  /** The objective statement - what we want to achieve */
  objective: string;
  /** Measurable key results that support the objective */
  keyResults: KeyResult[];
  /** ID of the clarification session that produced this OKR */
  sourceSessionId: string;
  /** ISO timestamp when this OKR was initially generated */
  generatedAt: string;
  /** ISO timestamp of the most recent manual edit, if any */
  lastEditedAt?: string | null;
  /** How regeneration should handle existing content */
  regenerationPolicy: RegenerationPolicy;
  /** Record of all manual edits made to this document */
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

export interface LlmQuestionOption {
  id: string;
  label: string;
  value?: string;
}

export interface LlmQuestion {
  id: string;
  text: string;
  options: LlmQuestionOption[];
}

export interface LlmNextQuestionResponse {
  question: LlmQuestion;
}

export interface LlmKeyResult {
  id?: string;
  statement?: string;
  target?: number | string;
  measurement?: string;
}

export interface LlmObjective {
  id?: string;
  title?: string;
  description?: string;
  keyResults?: LlmKeyResult[];
}

export interface LlmDraft {
  objectives?: LlmObjective[];
}

export interface LlmDraftResponse {
  draft?: LlmDraft;
}
