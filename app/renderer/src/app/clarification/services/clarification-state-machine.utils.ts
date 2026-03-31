import type {
  ClarificationState,
} from './clarification-state-machine.types.js';
  ClarificationState,
  WorkflowState,
  ErrorInfo,
} from './clarification-state-machine.types.js';
import { VALID_TRANSITIONS } from './clarification-state-machine.config.js';

/**
 * 检查是否可以从当前状态转换到目标状态
 * @param currentState - 当前工作流状态
 * @param targetState - 目标状态
 * @returns 是否允许转换
 */
export function canTransitionTo(currentState: WorkflowState, targetState: WorkflowState): boolean {
  return VALID_TRANSITIONS[currentState].includes(targetState);
}

/**
 * 获取特定提示的选择
 * @param state - 当前状态
 * @param promptId - 提示ID
 * @returns 选择的选项ID或null
 */
export function getSelection(state: ClarificationState, promptId: string): string | null {
  return state.selections[promptId] ?? null;
}

/**
 * 检查是否有特定提示的选择
 * @param state - 当前状态
 * @param promptId - 提示ID
 * @returns 是否已选择
 */
export function hasSelection(state: ClarificationState, promptId: string): boolean {
  return promptId in state.selections;
}

/**
 * 记录选择(兼容旧API)
 * @param state - 当前状态
 * @param optionId - 选项ID
 * @returns 提示ID和选项ID，如果当前没有提示则返回null
 */
export function getSelectionContext(
  state: ClarificationState,
  optionId: string,
): { promptId: string; optionId: string } | null {
  const prompt = state.currentPrompt;
  if (!prompt) {
    return null;
  }
  return { promptId: prompt.id, optionId };
}

export type {
  ErrorInfo,
  ClarificationState,
  WorkflowState,
} from './clarification-state-machine.types.js';
