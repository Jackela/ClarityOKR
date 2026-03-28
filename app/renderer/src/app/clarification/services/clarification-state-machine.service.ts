import { Injectable, signal, computed } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';

import type { Logger } from '../../core/services/logger.service';
import { environment } from '../../../environments/environment';

/**
 * Unified workflow state types
 * - idle: Initial/idle state
 * - loading: Loading data
 * - prompting: Showing clarification prompt
 * - ready: Ready to generate OKRs
 * - generating: Generating OKR
 * - completed: Process completed
 * - error: Error state
 */
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

/** State transition actions dispatched to the state machine */
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

/** Error information with message and recoverability flag */
 * 错误信息
 */
export interface ErrorInfo {
  message: string;
  recoverable: boolean;
}

/** Complete clarification state structure */
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

/** Initial state factory */
 * 初始状态
 */
const INITIAL_STATE: ClarificationState = {
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
 * 状态转换规则
 */
const VALID_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  idle: ['loading'],
  loading: ['prompting', 'error', 'generating'],
  prompting: ['loading', 'ready', 'error', 'generating'],
  ready: ['generating', 'loading', 'error'],
  generating: ['completed', 'error'],
  completed: ['idle'],
  error: ['idle', 'loading', 'prompting'],
};

/**
 * ClarificationStateMachine - Unified state machine for clarification workflow
 *
 * Architecture: StateMachine as single source of truth, Signals as derived views
 * - All state transitions via dispatch(action)
 * - Reducer ensures state consistency
 * - Computed signals provide derived state
 *
 * @example
 * ```typescript
 * // Use in component
 * constructor(private stateMachine: ClarificationStateMachine) {}
 *
 * // Read derived state
 * const prompt = this.stateMachine.currentPrompt();
 * const isReady = this.stateMachine.isReadyToGenerate();
 *
 * // Trigger state transitions
 * this.stateMachine.start('Improve team efficiency');
 * this.stateMachine.recordSelection('prompt-1', 'option-a');
 * ```
 */
 * ClarificationStateMachine - 统一的状态机
 *
 * 架构: StateMachine作为单一数据源，Signals作为派生视图
 * - 所有状态转换通过dispatch(action)执行
 * - reducer确保状态一致性
 * - computed signals提供派生状态
 *
 * @example
 * ```typescript
 * // 在组件中使用
 * constructor(private stateMachine: ClarificationStateMachine) {}
 *
 * // 读取派生状态
 * const prompt = this.stateMachine.currentPrompt();
 * const isReady = this.stateMachine.isReadyToGenerate();
 *
 * // 触发状态转换
 * this.stateMachine.start('提高团队效率');
 * this.stateMachine.recordSelection('prompt-1', 'option-a');
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ClarificationStateMachine {
  // === 核心状态 (单一数据源) ===
  private readonly _state = signal<ClarificationState>(INITIAL_STATE);

  // === 派生的只读 Signals ===

  /** Current workflow state */
  readonly workflowState = computed(() => this._state().workflowState);

  /** Current clarification prompt */
  readonly currentPrompt = computed(() => this._state().currentPrompt);

  /** Whether data is loading */
  readonly isLoading = computed(() => this._state().isLoading);

  /** Error information if any */
  readonly error = computed(() => this._state().error);

  /** Whether ready to generate OKR */
  readonly isReadyToGenerate = computed(() => this._state().isReadyToGenerate);

  /** User selection records */
  readonly selections = computed(() => this._state().selections);

  /** Active session ID */
  readonly sessionId = computed(() => this._state().sessionId);

  /** Validation error message */
  readonly validationError = computed(() => this._state().validationError);

  /** User intent */
  readonly intent = computed(() => this._state().intent);

  /** History of prompts shown */
  readonly history = computed(() => this._state().history);

  // === 计算属性 Signals ===

  /** Whether there is an error */
  readonly hasError = computed(() => this._state().error !== null);

  /** Number of selections made */
  readonly selectionCount = computed(() => Object.keys(this._state().selections).length);

  /** Whether a prompt is currently shown */
  readonly hasPrompt = computed(() => this._state().currentPrompt !== null);

  /** Error message text or null */
  readonly errorMessage = computed(() => this._state().error?.message ?? null);

  /** Current selection for the active prompt */
  readonly currentSelection = computed(() => {
    const prompt = this._state().currentPrompt;
    if (!prompt) return null;
    return this._state().selections[prompt.id] ?? null;
  });

  /** List of selected option IDs */
  readonly selectedOptionIds = computed(() => Object.values(this._state().selections));

  constructor(private readonly logger: Logger) {
    this.logger.debug('[STATE-MACHINE] Initialized');
  }

  // === State transition methods (business logic layer) ===

  /**
   * Starts a new clarification workflow.
   * Triggers: START action -> loading state
   *
   * @param intent - User's initial goal/intent description
   *
   * @example
   * stateMachine.start('Improve team efficiency');
   * // State: idle -> loading
   */

  /**
   * 开始新的澄清流程
   * 触发: START action -> loading 状态
   *
   * @param intent - 用户的初始目标意图描述
   *
   * @example
   * stateMachine.start('提高团队效率');
   * // 状态: idle -> loading
   */
  start(intent: string): void {
    this.logger.debug('[STATE-MACHINE] Action: START', { intent });
    this.dispatch({ type: 'START', payload: { intent } });
  }

  /**
   * Sets the current clarification prompt.
   * Triggers: SET_PROMPT action -> prompting state
   *
   * @param prompt - The clarification prompt to display
   *
   * @example
   * stateMachine.setPrompt({
   *   id: 'prompt-1',
   *   question: 'Select your goal type',
   *   options: [...]
   * });
   * // State: loading -> prompting
   */
   * 设置当前澄清提示
   * 触发: SET_PROMPT action -> prompting 状态
   *
   * @param prompt - 要显示的澄清提示
   *
   * @example
   * stateMachine.setPrompt({
   *   id: 'prompt-1',
   *   question: '请选择您的目标类型',
   *   options: [...]
   * });
   * // 状态: loading -> prompting
   */
  setPrompt(prompt: ClarificationPrompt | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_PROMPT', { promptId: prompt?.id ?? 'null' });
    this.dispatch({ type: 'SET_PROMPT', payload: { prompt } });
  }

  /**
   * Sets the loading state.
   *
   * @param loading - Whether data is loading
   * @param intent - Optional intent (set only when starting load)
   */
   * 设置加载状态
   *
   * @param loading - 是否加载中
   * @param intent - 可选的意图(仅在开始加载时设置)
   */
  setLoading(loading: boolean, intent?: string): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_LOADING', { loading, intent });
    this.dispatch({ type: 'SET_LOADING', payload: { loading } });
    if (loading && intent) {
      this.dispatch({ type: 'SET_INTENT', payload: { intent } });
    }
  }

  /**
   * Sets error state.
   * Triggers: SET_ERROR action -> error state
   *
   * @param error - Error message string or object
   *
   * @example
   * stateMachine.setError('Network connection failed');
   * // State: * -> error
   *
   * stateMachine.setError({ message: 'Validation failed', recoverable: false });
   * // State: * -> error, non-recoverable
   */
   * 触发: SET_ERROR action -> error 状态
   *
   * @param error - 错误信息字符串或对象
   *
   * @example
   * stateMachine.setError('网络连接失败');
   * // 状态: * -> error
   *
   * stateMachine.setError({ message: '验证失败', recoverable: false });
   * // 状态: * -> error, 不可恢复
   */
  setError(error: string | ErrorInfo | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_ERROR', { error });
    const errorInfo = typeof error === 'string' ? { message: error, recoverable: true } : error;
    this.dispatch({ type: 'SET_ERROR', payload: { error: errorInfo } });
  }

  /**
   * Clears error state.
   * Triggers: CLEAR_ERROR action
   * Automatically returns to previous valid state or idle
   */
   * 清除错误状态
   * 触发: CLEAR_ERROR action
   * 自动回到上一个有效状态或 idle
   */
  clearError(): void {
    this.logger.debug('[STATE-MACHINE] Action: CLEAR_ERROR');
    this.dispatch({ type: 'CLEAR_ERROR' });
  }

  /**
   * Records user selection.
   * Triggers: RECORD_SELECTION action
   * Automatically checks if ready to generate (at least 1 selection)
   *
   * @param promptId - The prompt ID
   * @param optionId - The selected option ID
   *
   * @example
   * stateMachine.recordSelection('prompt-1', 'option-a');
   * // If at least 1 selection: prompting -> ready
   */
   * 记录用户选择
   * 触发: RECORD_SELECTION action
   * 自动检查是否准备好生成(至少1个选择)
   *
   * @param promptId - 提示ID
   * @param optionId - 选择的选项ID
   *
   * @example
   * stateMachine.recordSelection('prompt-1', 'option-a');
   * // 如果有至少1个选择: prompting -> ready
   */
  recordSelection(promptId: string, optionId: string): void {
    this.logger.debug('[STATE-MACHINE] Action: RECORD_SELECTION', { promptId, optionId });
    this.dispatch({ type: 'RECORD_SELECTION', payload: { promptId, optionId } });
  }

  /**
   * Sets the session ID.
   * @param sessionId - The session ID or null
   */
   * 设置会话ID
   * @param sessionId - 会话ID或null
   */
  setSessionId(sessionId: string | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_SESSION_ID', { sessionId });
    this.dispatch({ type: 'SET_SESSION_ID', payload: { sessionId } });
  }

  /**
   * Sets validation error.
   * @param message - Error message or null
   */
   * 设置验证错误
   * @param message - 错误消息或null
   */
  setValidationError(message: string | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_VALIDATION_ERROR', { message });
    this.dispatch({ type: 'SET_VALIDATION_ERROR', payload: { message } });
  }

  /**
   * Sets user intent.
   * @param intent - User intent
   */
   * 设置意图
   * @param intent - 用户意图
   */
  setIntent(intent: string): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_INTENT', { intent });
    this.dispatch({ type: 'SET_INTENT', payload: { intent } });
  }

  /**
   * Sets state to generating.
   * Triggers: SET_GENERATING action -> generating state
   */
   * 设置为生成中状态
   * 触发: SET_GENERATING action -> generating 状态
   */
  setGenerating(): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_GENERATING');
    this.dispatch({ type: 'SET_GENERATING' });
  }

  /**
   * Sets state to completed.
   * Triggers: SET_COMPLETED action -> completed state
   *
   * @param okr - Optional OKR result
   */
   * 设置为完成状态
   * 触发: SET_COMPLETED action -> completed 状态
   *
   * @param okr - 可选的OKR结果
   */
  setCompleted(okr?: { objectives: unknown[] }): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_COMPLETED', { okr });
    this.dispatch({ type: 'SET_COMPLETED', payload: { okr } });
  }

  /**
   * Resets all state.
   * Triggers: RESET action -> back to initial state
   */
   * 重置所有状态
   * 触发: RESET action -> 回到 initial state
   */
  reset(): void {
    this.logger.debug('[STATE-MACHINE] Action: RESET');
    this.dispatch({ type: 'RESET' });
  }

  // === Compatibility layer (old API compatibility) ===

  /**
   * Records selection (old API compatibility).
   * @deprecated Use recordSelection(promptId, optionId)
   */

   * 记录选择(兼容旧API)
   * @deprecated 使用 recordSelection(promptId, optionId)
   */
  selectOption(optionId: string): void {
    const prompt = this.currentPrompt();
    if (prompt) {
      this.recordSelection(prompt.id, optionId);
    } else {
      this.logger.warn('[STATE-MACHINE] selectOption called with no current prompt');
    }
  }

  /**
   * Reports error (old API compatibility).
   * @deprecated Use setError(error)
   */
   * @deprecated 使用 setError(error)
   */
  reportError(error: string | ErrorInfo | null): void {
    this.setError(error);
  }

  /**
   * Sets ready state (old API compatibility).
   * @deprecated Ready state is now automatically calculated, this method has no effect
   */
   * @deprecated 就绪状态现在自动计算，此方法不再生效
   */
  setReady(_ready: boolean): void {
    this.logger.warn('[STATE-MACHINE] setReady is deprecated, readiness determined automatically');
  }

   * 标记就绪(兼容旧API)
   * @deprecated 使用 recordSelection 自动触发就绪状态
   */
  markReady(_ready: boolean): void {
    this.logger.warn('[STATE-MACHINE] markReady is deprecated, use recordSelection instead');
  }

  // === Helper methods ===

  /**
   * Gets selection for a specific prompt.
   * @param promptId - The prompt ID
   * @returns Selected option ID or null
   */
   * 获取特定提示的选择
   * @param promptId - 提示ID
   * @returns 选择的选项ID或null
   */
  getSelection(promptId: string): string | null {
    return this._state().selections[promptId] ?? null;
  }

  /**
   * Checks if there is a selection for a specific prompt.
   * @param promptId - The prompt ID
   * @returns Whether a selection exists
   */
   * 检查是否有特定提示的选择
   * @param promptId - 提示ID
   * @returns 是否已选择
   */
  hasSelection(promptId: string): boolean {
    return promptId in this._state().selections;
  }

  /**
   * Checks if can transition from current state to target state.
   * @param targetState - The target state
   * @returns Whether transition is allowed
   */
   * 检查是否可以从当前状态转换到目标状态
   * @param targetState - 目标状态
   * @returns 是否允许转换
   */
  canTransitionTo(targetState: WorkflowState): boolean {
    const currentState = this._state().workflowState;
    return VALID_TRANSITIONS[currentState].includes(targetState);
  }

  /**
   * Gets current state snapshot (for debugging/testing).
   * @returns Complete state object
   */
   * 获取当前状态快照(用于调试/测试)
   * @returns 完整状态对象
   */
  getStateSnapshot(): ClarificationState {
    return { ...this._state() };
  }

  // === Private methods: Reducer ===

  /**
   * Reducer - Pure function, handles all state transitions
   *
   * Core rules:
   * 1. Validate if state transition is valid
   * 2. Calculate new state based on action
   * 3. Auto-calculate derived values (like isReadyToGenerate)
   *
   * @param state - Current state
   * @param action - Action to execute
   * @returns New state
   */
   *
   * 核心规则:
   * 1. 验证状态转换是否合法
   * 2. 根据action计算新状态
   * 3. 自动计算派生值(如isReadyToGenerate)
   *
   * @param state - 当前状态
   * @param action - 动作
   * @returns 新状态
   */
  private reducer(state: ClarificationState, action: StateAction): ClarificationState {
    this.logger.debug('[STATE-MACHINE] Reducer processing:', action.type);

    switch (action.type) {
      case 'START': {
        const newState: ClarificationState = {
          ...INITIAL_STATE,
          workflowState: 'loading',
          isLoading: true,
          intent: action.payload.intent,
        };
        return this.validateTransition(state, newState);
      }

      case 'SET_PROMPT': {
        const { prompt } = action.payload;
        if (!prompt) {
          return { ...state, currentPrompt: null };
        }
        const newState: ClarificationState = {
          ...state,
          currentPrompt: prompt,
          isLoading: false,
          workflowState: 'prompting',
          history: [...state.history, prompt],
        };
        return this.validateTransition(state, newState);
      }

      case 'SET_LOADING': {
        const { loading } = action.payload;
        const newWorkflowState = loading ? 'loading' : state.workflowState;
        return {
          ...state,
          isLoading: loading,
          workflowState: newWorkflowState,
          ...(loading && { validationError: null }),
        };
      }

      case 'SET_ERROR': {
        const { error } = action.payload;
        if (!error) {
          return { ...state, error: null };
        }
        const newState: ClarificationState = {
          ...state,
          error,
          isLoading: false,
          workflowState: 'error',
        };
        return this.validateTransition(state, newState);
      }

      case 'CLEAR_ERROR': {
        const newWorkflowState = state.workflowState === 'error' ? 'idle' : state.workflowState;
        return {
          ...state,
          error: null,
          workflowState: newWorkflowState,
        };
      }

      case 'RECORD_SELECTION': {
        const { promptId, optionId } = action.payload;
        const newSelections = { ...state.selections, [promptId]: optionId };
        const selectionCount = Object.keys(newSelections).length;

        // Auto-calculate ready state: at least 1 selection means ready
        const isReadyToGenerate = selectionCount >= 1;
        const newWorkflowState = isReadyToGenerate ? 'ready' : state.workflowState;

        return {
          ...state,
          selections: newSelections,
          isReadyToGenerate,
          workflowState: newWorkflowState,
          validationError: null,
        };
      }

      case 'SET_SESSION_ID': {
        return { ...state, sessionId: action.payload.sessionId };
      }

      case 'SET_VALIDATION_ERROR': {
        return { ...state, validationError: action.payload.message };
      }

      case 'SET_INTENT': {
        return { ...state, intent: action.payload.intent };
      }

      case 'SET_GENERATING': {
        const newState: ClarificationState = {
          ...state,
          isLoading: true,
          workflowState: 'generating',
        };
        return this.validateTransition(state, newState);
      }

      case 'SET_COMPLETED': {
        const newState: ClarificationState = {
          ...state,
          isLoading: false,
          workflowState: 'completed',
        };
        return this.validateTransition(state, newState);
      }

      case 'RESET': {
        return INITIAL_STATE;
      }

      default:
        return state;
    }
  }

  /**
   * Validates state transition.
   * @param oldState - Old state
   * @param newState - New state
   * @returns New state (throws error if transition invalid)
   */
   * 验证状态转换
   * @param oldState - 旧状态
   * @param newState - 新状态
   * @returns 新状态(如果转换非法则抛出错误)
   */
  private validateTransition(
    oldState: ClarificationState,
    newState: ClarificationState,
  ): ClarificationState {
    if (oldState.workflowState === newState.workflowState) {
      return newState;
    }

    const allowedTransitions = VALID_TRANSITIONS[oldState.workflowState];
    if (!allowedTransitions.includes(newState.workflowState)) {
      const error = `Invalid state transition: ${oldState.workflowState} -> ${newState.workflowState}`;
      this.logger.error('[STATE-MACHINE]', error);
      // Throw error in development, fall back to old state in production
      if (!environment.production) {
        throw new Error(error);
      }
      return oldState;
    }

    this.logger.info(
      '[STATE-MACHINE] Transition:',
      `${oldState.workflowState} -> ${newState.workflowState}`,
    );
    return newState;
  }

  /**
   * Dispatches action.
   * @param action - Action to execute
   */
   * 分发动作
   * @param action - 要执行的动作
   */
  private dispatch(action: StateAction): void {
    this._state.update((currentState) => this.reducer(currentState, action));
  }
}
