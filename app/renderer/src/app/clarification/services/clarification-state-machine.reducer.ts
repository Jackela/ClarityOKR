import { environment } from '../../../environments/environment.js';
import type {
  ClarificationState,
  StateAction,
} from './clarification-state-machine.types.js';
  ClarificationState,
  StateAction,
  WorkflowState,
} from './clarification-state-machine.types.js';
import { INITIAL_STATE, VALID_TRANSITIONS } from './clarification-state-machine.config.js';
import type { Logger } from '../../core/services/logger.service.js';

/**
 * 验证状态转换
 * @param oldState - 旧状态
 * @param newState - 新状态
 * @param logger - 日志服务
 * @returns 新状态(如果转换非法则返回旧状态或抛出错误)
 */
export function validateTransition(
  oldState: ClarificationState,
  newState: ClarificationState,
  logger: Logger,
): ClarificationState {
  if (oldState.workflowState === newState.workflowState) {
    return newState;
  }

  const allowedTransitions = VALID_TRANSITIONS[oldState.workflowState];
  if (!allowedTransitions.includes(newState.workflowState)) {
    const error = `Invalid state transition: ${oldState.workflowState} -> ${newState.workflowState}`;
    logger.error('[STATE-MACHINE]', error);
    // 在开发环境抛出错误，生产环境回退到旧状态
    if (!environment.production) {
      throw new Error(error);
    }
    return oldState;
  }

  logger.info(
    '[STATE-MACHINE] Transition:',
    `${oldState.workflowState} -> ${newState.workflowState}`,
  );
  return newState;
}

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
 * @param logger - 日志服务
 * @returns 新状态
 */
export function stateMachineReducer(
  state: ClarificationState,
  action: StateAction,
  logger: Logger,
): ClarificationState {
  logger.debug('[STATE-MACHINE] Reducer processing:', action.type);

  switch (action.type) {
    case 'START': {
      const newState: ClarificationState = {
        ...INITIAL_STATE,
        workflowState: 'loading',
        isLoading: true,
        intent: action.payload.intent,
      };
      return validateTransition(state, newState, logger);
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
      return validateTransition(state, newState, logger);
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
      return validateTransition(state, newState, logger);
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
      return validateTransition(state, newState, logger);
    }

    case 'SET_COMPLETED': {
      const newState: ClarificationState = {
        ...state,
        isLoading: false,
        workflowState: 'completed',
      };
      return validateTransition(state, newState, logger);
    }

    case 'RESET': {
      return INITIAL_STATE;
    }

    default:
      return state;
  }
}
