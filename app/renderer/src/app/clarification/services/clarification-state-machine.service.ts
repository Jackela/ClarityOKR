import { Injectable, signal, computed } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Logger } from '../../core/services/logger.service';
import { environment } from '../../../environments/environment';

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

/**
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

/**
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

  /** 当前工作流状态 */
  readonly workflowState = computed(() => this._state().workflowState);

  /** 当前澄清提示 */
  readonly currentPrompt = computed(() => this._state().currentPrompt);

  /** 是否加载中 */
  readonly isLoading = computed(() => this._state().isLoading);

  /** 错误信息 */
  readonly error = computed(() => this._state().error);

  /** 是否准备好生成OKR */
  readonly isReadyToGenerate = computed(() => this._state().isReadyToGenerate);

  /** 用户选择记录 */
  readonly selections = computed(() => this._state().selections);

  /** 会话ID */
  readonly sessionId = computed(() => this._state().sessionId);

  /** 验证错误信息 */
  readonly validationError = computed(() => this._state().validationError);

  /** 用户意图 */
  readonly intent = computed(() => this._state().intent);

  /** 历史记录 */
  readonly history = computed(() => this._state().history);

  // === 计算属性 Signals ===

  /** 是否有错误 */
  readonly hasError = computed(() => this._state().error !== null);

  /** 选择数量 */
  readonly selectionCount = computed(() => Object.keys(this._state().selections).length);

  /** 是否有提示 */
  readonly hasPrompt = computed(() => this._state().currentPrompt !== null);

  /** 错误消息文本 */
  readonly errorMessage = computed(() => this._state().error?.message ?? null);

  /** 当前选择 */
  readonly currentSelection = computed(() => {
    const prompt = this._state().currentPrompt;
    if (!prompt) return null;
    return this._state().selections[prompt.id] ?? null;
  });

  /** 已选择的选项ID列表 */
  readonly selectedOptionIds = computed(() => Object.values(this._state().selections));

  constructor(private readonly logger: Logger) {
    this.logger.debug('[STATE-MACHINE] Initialized');
  }

  // === 状态转换方法 (业务逻辑层) ===

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
   * 设置错误状态
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
   * 清除错误状态
   * 触发: CLEAR_ERROR action
   * 自动回到上一个有效状态或 idle
   */
  clearError(): void {
    this.logger.debug('[STATE-MACHINE] Action: CLEAR_ERROR');
    this.dispatch({ type: 'CLEAR_ERROR' });
  }

  /**
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
   * 设置会话ID
   * @param sessionId - 会话ID或null
   */
  setSessionId(sessionId: string | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_SESSION_ID', { sessionId });
    this.dispatch({ type: 'SET_SESSION_ID', payload: { sessionId } });
  }

  /**
   * 设置验证错误
   * @param message - 错误消息或null
   */
  setValidationError(message: string | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_VALIDATION_ERROR', { message });
    this.dispatch({ type: 'SET_VALIDATION_ERROR', payload: { message } });
  }

  /**
   * 设置意图
   * @param intent - 用户意图
   */
  setIntent(intent: string): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_INTENT', { intent });
    this.dispatch({ type: 'SET_INTENT', payload: { intent } });
  }

  /**
   * 设置为生成中状态
   * 触发: SET_GENERATING action -> generating 状态
   */
  setGenerating(): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_GENERATING');
    this.dispatch({ type: 'SET_GENERATING' });
  }

  /**
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
   * 重置所有状态
   * 触发: RESET action -> 回到 initial state
   */
  reset(): void {
    this.logger.debug('[STATE-MACHINE] Action: RESET');
    this.dispatch({ type: 'RESET' });
  }

  // === 辅助方法 ===

  /**
   * 获取特定提示的选择
   * @param promptId - 提示ID
   * @returns 选择的选项ID或null
   */
  getSelection(promptId: string): string | null {
    return this._state().selections[promptId] ?? null;
  }

  /**
   * 检查是否有特定提示的选择
   * @param promptId - 提示ID
   * @returns 是否已选择
   */
  hasSelection(promptId: string): boolean {
    return promptId in this._state().selections;
  }

  /**
   * 检查是否可以从当前状态转换到目标状态
   * @param targetState - 目标状态
   * @returns 是否允许转换
   */
  canTransitionTo(targetState: WorkflowState): boolean {
    const currentState = this._state().workflowState;
    return VALID_TRANSITIONS[currentState].includes(targetState);
  }

  /**
   * 获取当前状态快照(用于调试/测试)
   * @returns 完整状态对象
   */
  getStateSnapshot(): ClarificationState {
    return { ...this._state() };
  }

  // === 私有方法: Reducer ===

  /**
   * Reducer - 纯函数，处理所有状态转换
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

        // 自动计算就绪状态: 至少1个选择即为ready
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
      // 在开发环境抛出错误，生产环境回退到旧状态
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
   * 分发动作
   * @param action - 要执行的动作
   */
  private dispatch(action: StateAction): void {
    this._state.update((currentState) => this.reducer(currentState, action));
  }
}
