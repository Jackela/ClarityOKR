import type { ClarificationPrompt, WorkflowState } from '@clarityokr/contracts';

// Re-export WorkflowState for consumers
export type { WorkflowState } from '@clarityokr/contracts';

/** Error information with message and recoverability flag */
export interface ErrorInfo {
  message: string;
  recoverable: boolean;
}

/** Complete clarification state structure */
export interface ClarificationState {
  workflowState: WorkflowState;
  currentPrompt: ClarificationPrompt | null;
  isLoading: boolean;
  error: ErrorInfo | null;
  isReadyToGenerate: boolean;
  selections: Record<string, string>;
  sessionId: string | null;
  validationError: string | null;
  intent: string;
  history: ClarificationPrompt[];
}

/** State transition actions dispatched to the state machine */
export type StateAction =
  | { type: 'START'; payload: { intent: string } }
  | { type: 'SET_PROMPT'; payload: { prompt: ClarificationPrompt | null } }
  | { type: 'SET_LOADING'; payload: { loading: boolean } }
  | { type: 'SET_ERROR'; payload: { error: ErrorInfo | null } }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RECORD_SELECTION'; payload: { promptId: string; optionId: string } }
  | { type: 'SET_SESSION_ID'; payload: { sessionId: string | null } }
  | { type: 'SET_VALIDATION_ERROR'; payload: { message: string | null } }
  | { type: 'SET_GENERATING' }
  | { type: 'SET_COMPLETED'; payload: { okr?: { objectives: unknown[] } } }
  | { type: 'SET_INTENT'; payload: { intent: string } }
  | { type: 'RESET' };

/** Initial state factory */
export const INITIAL_STATE: ClarificationState = {
  workflowState: 'idle',
  currentPrompt: null,
  isLoading: false,
  error: null,
  isReadyToGenerate: false,
  selections: {},
  sessionId: null,
  validationError: null,
  intent: '',
  history: [],
};

/** State transition rules defining valid transitions from each state */
export const VALID_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  idle: ['loading'],
  loading: ['prompting', 'error', 'generating'],
  prompting: ['loading', 'ready', 'error', 'generating'],
  ready: ['generating', 'loading', 'error'],
  generating: ['completed', 'error'],
  completed: ['idle'],
  error: ['idle', 'loading', 'prompting'],
};
