import type { ClarificationSession, ClarificationStatus } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { IClarificationStateMachine } from './interfaces/state-machine.interface.js';
import { StateTransitionError } from './types.js';

/**
 * ClarificationStateMachine - 状态转换管理
 * 职责：定义和执行澄清流程的状态机
 */
export class ClarificationStateMachine implements IClarificationStateMachine {
  /**
   * 状态转换规则表
   */
  private static readonly TRANSITIONS: Record<ClarificationStatus, readonly ClarificationStatus[]> =
    {
      collecting: ['ready', 'completed'],
      ready: ['collecting', 'completed'],
      completed: [],
    };

  /**
   * 执行状态转换
   */
  async transition(session: ClarificationSession, targetState: ClarificationStatus): Promise<void> {
    const currentState = session.status;

    if (!this.canTransition(currentState, targetState)) {
      throw new StateTransitionError(currentState, targetState);
    }

    session.status = targetState;
    session.updatedAt = new Date().toISOString();

    Logger.info(
      `[StateMachine] Session ${session.id} transitioned: ${currentState} → ${targetState}`,
    );
  }

  /**
   * 获取当前状态
   */
  getState(session: ClarificationSession): ClarificationStatus {
    return session.status;
  }

  /**
   * 检查是否可以执行状态转换
   */
  canTransition(fromState: ClarificationStatus, toState: ClarificationStatus): boolean {
    const allowedTransitions = ClarificationStateMachine.TRANSITIONS[fromState];
    return allowedTransitions.includes(toState);
  }

  /**
   * 获取所有允许的状态转换
   */
  getAllowedTransitions(fromState: ClarificationStatus): ClarificationStatus[] {
    return [...ClarificationStateMachine.TRANSITIONS[fromState]];
  }
}
