import { Injectable, NgZone } from '@angular/core';
import {
  clarificationOptionSelectionSchema,
  clarificationPromptRequestSchema,
  clarificationPromptResponseSchema,
} from '@clarityokr/contracts';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { Logger } from '../../core/services/logger.service';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import type { ClarifyOkrApi } from '../../shared/window';
import { SyncClarificationState } from './sync-clarification-state.service';

@Injectable({ providedIn: 'root' })
export class ClarificationOrchestratorService {
  private isListenerRegistered = false;

  constructor(
    private readonly state: SyncClarificationState,
    private readonly zone: NgZone,
    private readonly logger: Logger,
  ) {
    this.registerPromptListener();
  }

  /**
   * 开始澄清流程并请求第一个提示
   *
   * 验证会话ID和意图，设置加载状态，然后调用 Electron IPC 通道
   * 请求 LLM 返回第一个澄清提示。成功后更新状态为 prompting。
   *
   * @param sessionId - 会话的唯一标识符
   * @param intent - 用户的初始目标意图描述
   * @returns Observable 在成功设置提示后完成，错误时抛出
   * @throws 当验证失败或 IPC 调用失败时抛出错误
   *
   * @example
   * orchestrator.requestPrompt('session-123', '提高团队效率')
   *   .subscribe({
   *     next: () => console.log('第一个提示已加载'),
   *     error: (err) => console.error('请求失败:', err)
   *   });
   */
  requestPrompt(sessionId: string, intent: string): Observable<void> {
    this.logger.debug('[ORCHESTRATOR] requestPrompt called', { sessionId, intent });
    const bridge = this.ensureBridge();
    const parsed = clarificationPromptRequestSchema.safeParse({ sessionId, intent });
    if (!parsed.success) {
      const message = parsed.error.message;
      this.logger.debug('[ORCHESTRATOR] Validation error:', message);
      this.state.setValidationError(message);
      return throwError(() => new Error(message));
    }

    this.state.setSessionId(sessionId);
    this.logger.debug('[ORCHESTRATOR] Setting loading state with intent:', intent);
    this.state.start(intent);

    return from(bridge.invoke(IPC_CHANNELS.CLARIFICATION_PROMPT, parsed.data)).pipe(
      map((response) => clarificationPromptResponseSchema.safeParse(response)),
      tap((result) => {
        if (!result.success) {
          throw result.error;
        }
        this.logger.debug('[ORCHESTRATOR] Setting prompt:', result.data.prompt.id);
        this.state.setPrompt(result.data.prompt);
      }),
      map(() => void 0),
      catchError((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.debug('[ORCHESTRATOR] Caught error in requestPrompt:', message, { error });
        // Set error state synchronously
        this.state.setError({ message, recoverable: true });
        return throwError(() => (error instanceof Error ? error : new Error(message)));
      }),
    );
  }

  /**
   * 处理用户对澄清提示选项的选择
   *
   * 同步更新状态记录用户选择，然后通过 IPC 通道发送选择到主进程
   * 主进程会根据选择决定下一个提示或生成 OKR
   *
   * @param sessionId - 当前会话的唯一标识符
   * @param promptId - 当前提示的唯一标识符
   * @param optionId - 用户选择的选项 ID
   * @returns Observable 完成时表示选择已发送
   * @throws 当验证失败时抛出错误
   *
   * @example
   * orchestrator.recordSelection('session-123', 'prompt-1', 'option-a')
   *   .subscribe(() => console.log('选择已记录'));
   */
  recordSelection(sessionId: string, promptId: string, optionId: string): Observable<void> {
    const bridge = this.ensureBridge();

    // Update state synchronously first
    this.state.recordSelection(promptId, optionId);

    const parsed = clarificationOptionSelectionSchema.safeParse({ sessionId, promptId, optionId });
    if (!parsed.success) {
      const message = parsed.error.message;
      this.state.setValidationError(message);
      return throwError(() => new Error(message));
    }

    bridge.send(IPC_CHANNELS.CLARIFICATION_RESPOND, parsed.data);
    return of(void 0);
  }

  markReady(ready: boolean): void {
    this.logger.debug('[ORCHESTRATOR] markReady:', ready);
    this.state.setReady(ready);
  }

  /**
   * 请求下一个澄清问题
   *
   * 封装加载状态管理和错误处理，防止组件直接操作 store
   * 当前为临时实现，未来应使用新的 LlmGateway 抽象
   *
   * @param _questionId - 当前问题的 ID（预留参数）
   * @param _optionId - 用户选择的选项 ID（预留参数）
   * @returns Observable 完成时返回 null（当前为占位实现）
   *
   * @example
   * orchestrator.requestNextQuestion('q-1', 'opt-a').subscribe();
   */
  requestNextQuestion(_questionId: string, _optionId: string): Observable<unknown> {
    this.state.setLoading(true);

    // Note: This is a temporary implementation that uses the old llmGateway
    // In the future, this should be refactored to use the new LlmGateway abstraction
    // For now, we keep the direct gateway call but manage store state properly
    return of(null);
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.logger.debug('[ORCHESTRATOR] clearError called');
    this.state.clearError();
    this.logger.debug('[ORCHESTRATOR] clearError completed');
  }

  private registerPromptListener(): void {
    if (this.isListenerRegistered) {
      return;
    }

    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      return;
    }

    bridge.on(IPC_CHANNELS.CLARIFICATION_PROMPT, (_event, payload) => {
      this.logger.debug('[ORCHESTRATOR] Received CLARIFICATION_PROMPT event', payload);
      this.zone.run(() => {
        const parsed = clarificationPromptResponseSchema.safeParse(payload);
        if (!parsed.success) {
          const message = parsed.error.message;
          this.logger.debug('[ORCHESTRATOR] Parse error in prompt listener:', message);
          this.state.setError({ message, recoverable: true });
          return;
        }
        this.logger.debug('[ORCHESTRATOR] Setting prompt from listener:', parsed.data.prompt.id);
        this.state.setPrompt(parsed.data.prompt);
      });
    });

    this.isListenerRegistered = true;
  }

  private ensureBridge(): ClarifyOkrApi {
    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      this.logger.error('[renderer] clarifyOkr bridge missing');
      throw new Error('ClarifyOKR bridge is unavailable.');
    }
    this.logger.info('[renderer] clarifyOkr bridge established');
    return bridge;
  }

  private bridgeOrUndefined(): ClarifyOkrApi | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const candidate = (window as Window & { clarifyOkr?: ClarifyOkrApi }).clarifyOkr;
    return candidate;
  }
}
