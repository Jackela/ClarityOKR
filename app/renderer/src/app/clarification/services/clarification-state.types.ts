import type { ClarificationPrompt } from '@clarityokr/contracts';

/**
 * 统一的状态类型
 */
export type WorkflowState =
  | 'idle' // 初始/空闲状态
  | 'loading' // 加载中
  | 'prompting' // 显示澄清提示
  | 'ready' // 已准备好生成
  | 'generating' // 生成OKR中
  | 'completed' // 已完成
  | 'error'; // 错误状态

/**
 * 状态转换动作
 */
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

/**
 * 错误信息
 */
export interface ErrorInfo {
  message: string;
  recoverable: boolean;
}

/**
 * 状态结构
 */
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
