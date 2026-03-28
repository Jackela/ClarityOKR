import type { ClarificationState, WorkflowState } from './clarification-state-machine.types.js';

/**
 * 初始状态
 */
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

/**
 * 状态转换规则
 */
export const VALID_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  idle: ['loading'],
  loading: ['prompting', 'error', 'generating'],
  prompting: ['loading', 'ready', 'error', 'generating'],
  ready: ['generating', 'loading', 'error'],
  generating: ['completed', 'error'],
  completed: ['idle'],
  error: ['idle', 'loading', 'prompting'],
};
