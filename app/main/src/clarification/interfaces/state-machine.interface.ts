import type { ClarificationSession, ClarificationStatus } from '@clarityokr/contracts';

/**
 * 状态转换管理接口
 * 职责：定义状态转换规则并执行状态变更
 */
export interface IClarificationStateMachine {
  /**
   * 执行状态转换
   * @param session - 当前会话
   * @param targetState - 目标状态
   * @throws {StateTransitionError} 如果转换不合法
   */
  transition(session: ClarificationSession, targetState: ClarificationStatus): Promise<void>;

  /**
   * 获取当前状态
   * @param session - 会话对象
   * @returns 当前状态
   */
  getState(session: ClarificationSession): ClarificationStatus;

  /**
   * 检查是否可以执行状态转换
   * @param fromState - 当前状态
   * @param toState - 目标状态
   * @returns 是否允许转换
   */
  canTransition(fromState: ClarificationStatus, toState: ClarificationStatus): boolean;
}
