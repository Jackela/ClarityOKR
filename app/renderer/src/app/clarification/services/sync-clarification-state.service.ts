import { Injectable, inject } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';

import type { Logger } from '../../core/services/logger.service';
import type {
  ErrorInfo,
  WorkflowState} from './clarification-state-machine.service';
import {
  ClarificationStateMachine
} from './clarification-state-machine.service';

/**
 * SyncClarificationState - 状态机适配器服务
 *
 * 此服务现在是 ClarificationStateMachine 的适配器层。
 * 提供与旧API的完全向后兼容性。
 *
 * 架构:
 * - ClarificationStateMachine: 单一数据源，管理所有状态转换
 * - SyncClarificationState: 适配器，保持旧API兼容
 *
 * @deprecated 请直接使用 ClarificationStateMachine
 *
 * @example
 * // 新推荐用法
 * constructor(private stateMachine: ClarificationStateMachine) {}
 *
 * // 兼容旧用法(仍可工作)
 * constructor(private state: SyncClarificationState) {}
 */
@Injectable({ providedIn: 'root' })
export class SyncClarificationState {
  private readonly stateMachine = inject(ClarificationStateMachine);

  // === 派生自 StateMachine 的 Signals ===

  /** 当前澄清提示 */
  readonly currentPrompt = this.stateMachine.currentPrompt;

  /** 是否加载中 */
  readonly isLoading = this.stateMachine.isLoading;

  /** 错误信息 */
  readonly error = this.stateMachine.error;

  /** 是否准备好生成 */
  readonly isReadyToGenerate = this.stateMachine.isReadyToGenerate;

  /** 用户选择记录 */
  readonly selections = this.stateMachine.selections;

  /** 会话ID */
  readonly sessionId = this.stateMachine.sessionId;

  /** 验证错误信息 */
  readonly validationError = this.stateMachine.validationError;

  /** 用户意图 */
  readonly intent = this.stateMachine.intent;

  /** 工作流状态 */
  readonly workflowState = this.stateMachine.workflowState;

  /** 历史记录 */
  readonly history = this.stateMachine.history;

  // === 计算属性 Signals ===

  /** 是否有错误 */
  readonly hasError = this.stateMachine.hasError;

  /** 选择数量 */
  readonly selectionCount = this.stateMachine.selectionCount;

  /** 是否有提示 */
  readonly hasPrompt = this.stateMachine.hasPrompt;

  /** 错误消息文本 */
  readonly errorMessage = this.stateMachine.errorMessage;

  /** 当前选择 */
  readonly currentSelection = this.stateMachine.currentSelection;

  /** 已选择的选项ID列表 */
  readonly selectedOptionIds = this.stateMachine.selectedOptionIds;

  constructor(private readonly logger: Logger) {
    this.logger.debug('[SYNC-STATE] Adapter initialized (delegates to StateMachine)');
  }

  // === 同步方法 (委托给 StateMachine) ===

  /**
   * 设置当前的澄清提示
   * @param prompt - 要显示的澄清提示
   */
  setPrompt(prompt: ClarificationPrompt | null): void {
    this.logger.debug('[SYNC-STATE] setPrompt (delegated)');
    this.stateMachine.setPrompt(prompt);
  }

  /**
   * 设置加载状态
   * @param loading - 是否加载中
   * @param intent - 可选的意图
   */
  setLoading(loading: boolean, intent?: string): void {
    this.logger.debug('[SYNC-STATE] setLoading (delegated)');
    this.stateMachine.setLoading(loading, intent);
  }

  /**
   * 设置错误状态
   * @param error - 错误信息字符串或对象
   */
  setError(error: string | ErrorInfo | null): void {
    this.logger.debug('[SYNC-STATE] setError (delegated)');
    this.stateMachine.setError(error);
  }

  /**
   * 清除错误状态
   */
  clearError(): void {
    this.logger.debug('[SYNC-STATE] clearError (delegated)');
    this.stateMachine.clearError();
  }

  /**
   * 设置就绪状态
   * @deprecated 就绪状态现在自动计算
   * @param ready - 是否就绪
   */
  setReady(ready: boolean): void {
    this.stateMachine.setReady(ready);
  }

  /**
   * 记录用户选择
   * @param promptId - 提示ID
   * @param optionId - 选择的选项ID
   */
  recordSelection(promptId: string, optionId: string): void {
    this.logger.debug('[SYNC-STATE] recordSelection (delegated)');
    this.stateMachine.recordSelection(promptId, optionId);
  }

  /**
   * 设置会话ID
   * @param sessionId - 会话ID或null
   */
  setSessionId(sessionId: string | null): void {
    this.logger.debug('[SYNC-STATE] setSessionId (delegated)');
    this.stateMachine.setSessionId(sessionId);
  }

  /**
   * 设置验证错误
   * @param message - 错误消息或null
   */
  setValidationError(message: string | null): void {
    this.logger.debug('[SYNC-STATE] setValidationError (delegated)');
    this.stateMachine.setValidationError(message);
  }

  /**
   * 设置意图
   * @param intent - 用户意图
   */
  setIntent(intent: string): void {
    this.logger.debug('[SYNC-STATE] setIntent (delegated)');
    this.stateMachine.setIntent(intent);
  }

  /**
   * 重置所有状态
   */
  reset(): void {
    this.logger.debug('[SYNC-STATE] reset (delegated)');
    this.stateMachine.reset();
  }

  /**
   * 开始新的澄清流程
   * @param intent - 用户的初始目标意图描述
   */
  start(intent: string): void {
    this.logger.debug('[SYNC-STATE] start (delegated)');
    this.stateMachine.start(intent);
  }

  /**
   * 记录选项选择
   * @deprecated 使用 recordSelection(promptId, optionId)
   * @param optionId - 选择的选项ID
   */
  selectOption(optionId: string): void {
    this.stateMachine.selectOption(optionId);
  }

  /**
   * 报告错误
   * @deprecated 使用 setError(error)
   * @param error - 错误信息
   */
  reportError(error: string | ErrorInfo | null): void {
    this.stateMachine.reportError(error);
  }

  /**
   * 设置为生成中状态
   */
  setGenerating(): void {
    this.logger.debug('[SYNC-STATE] setGenerating (delegated)');
    this.stateMachine.setGenerating();
  }

  /**
   * 设置为完成状态
   * @param okr - 可选的OKR结果
   */
  setCompleted(okr?: { objectives: unknown[] }): void {
    this.logger.debug('[SYNC-STATE] setCompleted (delegated)');
    this.stateMachine.setCompleted(okr);
  }

  /**
   * 标记为就绪生成
   * @deprecated 使用 recordSelection 自动触发就绪状态
   * @param _ready - 是否就绪(已忽略)
   */
  markReady(_ready: boolean): void {
    this.stateMachine.markReady(_ready);
  }

  // === 辅助方法 (委托给 StateMachine) ===

  /**
   * 获取特定提示的选择
   * @param promptId - 提示ID
   * @returns 选择的选项ID或null
   */
  getSelection(promptId: string): string | null {
    return this.stateMachine.getSelection(promptId);
  }

  /**
   * 检查是否有特定提示的选择
   * @param promptId - 提示ID
   * @returns 是否已选择
   */
  hasSelection(promptId: string): boolean {
    return this.stateMachine.hasSelection(promptId);
  }

  /**
   * 获取当前状态快照
   * @returns 完整状态对象
   */
  getStateSnapshot(): {
    workflowState: WorkflowState;
    sessionId: string | null;
    currentPrompt: ClarificationPrompt | null;
    selections: Record<string, string>;
    history: ClarificationPrompt[];
    validationError: string | null;
    error: ErrorInfo | null;
  } {
    return this.stateMachine.getStateSnapshot();
  }
}
