import { Injectable } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { Logger } from '../../core/services/logger.service';
import { ClarificationStateMachine } from './clarification-state-machine.service';
import type { ErrorInfo, WorkflowState } from './clarification-state.types.js';

/**
 * SyncClarificationState - 同步澄清状态适配器
 * @deprecated 请直接使用 ClarificationStateMachine
 *
 * 这是一个过渡性服务，用于向后兼容。
 * 新代码应直接注入 ClarificationStateMachine。
 */
@Injectable({
  providedIn: 'root',
})
export class SyncClarificationState {
  constructor(
    private readonly stateMachine: ClarificationStateMachine,
    private readonly logger: Logger,
  ) {
    this.logger.warn(
      '[SYNC-STATE] SyncClarificationState is deprecated. Use ClarificationStateMachine directly.',
    );
  }

  // === 派生状态 (直接代理到 StateMachine 的 Signals) ===

  get workflowState() {
    return this.stateMachine.workflowState;
  }

  get currentPrompt() {
    return this.stateMachine.currentPrompt;
  }

  get isLoading() {
    return this.stateMachine.isLoading;
  }

  get error() {
    return this.stateMachine.error;
  }

  get isReadyToGenerate() {
    return this.stateMachine.isReadyToGenerate;
  }

  get selections() {
    return this.stateMachine.selections;
  }

  get sessionId() {
    return this.stateMachine.sessionId;
  }

  get validationError() {
    return this.stateMachine.validationError;
  }

  get intent() {
    return this.stateMachine.intent;
  }

  get history() {
    return this.stateMachine.history;
  }

  get hasError() {
    return this.stateMachine.hasError;
  }

  get selectionCount() {
    return this.stateMachine.selectionCount;
  }

  get hasPrompt() {
    return this.stateMachine.hasPrompt;
  }

  get errorMessage() {
    return this.stateMachine.errorMessage;
  }

  get currentSelection() {
    return this.stateMachine.currentSelection;
  }

  get selectedOptionIds() {
    return this.stateMachine.selectedOptionIds;
  }

  // === 状态操作方法 (委托给 StateMachine) ===

  /**
   * 开始新的澄清流程
   * @param intent - 用户的初始目标意图描述
   */
  start(intent: string): void {
    this.logger.debug('[SYNC-STATE] start (delegated)');
    this.stateMachine.start(intent);
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
   * 设置提示
   * @param prompt - 提示对象或null
   */
  setPrompt(prompt: ClarificationPrompt | null): void {
    this.logger.debug('[SYNC-STATE] setPrompt (delegated)');
    this.stateMachine.setPrompt(prompt);
  }

  /**
   * 设置加载状态
   * @param loading - 是否加载中
   */
  setLoading(loading: boolean): void {
    this.logger.debug('[SYNC-STATE] setLoading (delegated)');
    this.stateMachine.setLoading(loading);
  }

  /**
   * 设置错误
   * @param error - 错误信息或null
   */
  setError(error: string | ErrorInfo | null): void {
    this.logger.debug('[SYNC-STATE] setError (delegated)');
    this.stateMachine.setError(error);
  }

  /**
   * 清除错误
   */
  clearError(): void {
    this.logger.debug('[SYNC-STATE] clearError (delegated)');
    this.stateMachine.clearError();
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.logger.debug('[SYNC-STATE] reset (delegated)');
    this.stateMachine.reset();
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
