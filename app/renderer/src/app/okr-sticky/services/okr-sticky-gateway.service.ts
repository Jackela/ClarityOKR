import { Injectable } from '@angular/core';
import type { OnDestroy } from
import {
  generateOKRRequestSchema,
  generateOKRResponseSchema,
  okrDocumentSchema,
} from '@clarityokr/contracts';
import type { GenerateOKRRequest, OKRDocument } from '@clarityokr/contracts';
import { BehaviorSubject } from 'rxjs';
import type { Observable } from
import { map } from 'rxjs/operators';

import { Logger } from '../../core/services/logger.service';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import type { ClarifyOkrApi } from '../../shared/window';

import { OkrProjectionService, type OkrStickyViewModel } from './okr-projection.service';

@Injectable({ providedIn: 'root' })
export class OkrStickyGatewayService implements OnDestroy {
  private readonly viewModelSubject = new BehaviorSubject<OkrStickyViewModel | null>(null);
  private okrListenerUnsubscribe?: () => void;

  readonly viewModel$: Observable<OkrStickyViewModel | null> = this.viewModelSubject.asObservable();
  readonly hasStickyNote$: Observable<boolean> = this.viewModel$.pipe(map((vm) => vm !== null));

  getCurrentViewModel(): OkrStickyViewModel | null {
    return this.viewModelSubject.getValue();
  }

  constructor(
    private readonly projection: OkrProjectionService,
    private readonly logger: Logger,
  ) {
    this.registerListeners();
    void this.hydrateFromMain();
  }

  ngOnDestroy(): void {
    if (this.okrListenerUnsubscribe) {
      this.okrListenerUnsubscribe();
      this.okrListenerUnsubscribe = undefined;
      this.logger.debug('[STICKY-GATEWAY] IPC listener cleaned up');
    }
  }

  /**
   * 创建新的 OKR 便签文档
   *
   * 通过 Electron IPC 通道调用主进程的 LLM 生成 OKR 草稿，
   * 并将返回的 OKR 文档转换为 ViewModel 存储在状态中。
   *
   * @param sessionId - 当前澄清会话的唯一标识符
   * @param intentSummary - 用户意图的总结描述
   * @returns Promise 解析为生成的 OKR ViewModel
   * @throws 当 IPC 桥不可用、验证失败或生成失败时抛出错误
   *
   * @example
   * const viewModel = await gateway.generate('session-123', '提高团队效率');
   * console.log('OKR 已生成:', viewModel.objective);
   */
  async generate(sessionId: string, intentSummary: string): Promise<OkrStickyViewModel> {
    const bridge = this.ensureBridge();
    const payload = generateOKRRequestSchema.parse({
      sessionId,
      intentSummary,
    } satisfies GenerateOKRRequest);
    this.logger.info('[renderer] requesting OKR generation (LLM)', payload);
    const response = await bridge.invoke(IPC_CHANNELS.LLM_GENERATE_DRAFT, {
      context: undefined,
      sessionId,
    });
    const parsed = generateOKRResponseSchema.parse(response);

    return this.storeDocument(parsed.okr);
  }

  /**
   * 重新打开 OKR 便签窗口
   *
   * 通过 Electron IPC 通道通知主进程重新显示 OKR 便签窗口。
   * 通常在用户点击便签图标或从菜单触发时使用。
   *
   * @returns Promise 在窗口重新打开后解析
   * @throws 当 IPC 桥不可用时抛出错误
   *
   * @example
   * await gateway.reopenSticky();
   * // 便签窗口已重新显示
   */
  async reopenSticky(): Promise<void> {
    const bridge = this.ensureBridge();
    await bridge.invoke(IPC_CHANNELS.STICKY_REOPEN, undefined);
  }

  private registerListeners(): void {
    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      return;
    }

    this.okrListenerUnsubscribe = bridge.on(IPC_CHANNELS.OKR_GENERATE, (_event, payload) => {
      const parsedResponse = generateOKRResponseSchema.safeParse(payload);
      if (parsedResponse.success) {
        this.logger.info(
          '[renderer] received OKR payload via response',
          parsedResponse.data.okr.id,
        );
        this.storeDocument(parsedResponse.data.okr);
        return;
      }

      const parsedDocument = okrDocumentSchema.safeParse(
        (payload as { okr?: unknown })?.okr ?? payload,
      );
      if (parsedDocument.success) {
        this.logger.info('[renderer] received OKR document broadcast', parsedDocument.data.id);
        this.storeDocument(parsedDocument.data);
        return;
      }

      this.logger.error(
        '[renderer] Failed to parse OKR payload from main process',
        parsedResponse.error,
      );
    });
    this.logger.debug('[STICKY-GATEWAY] IPC listener registered');
  }

  private storeDocument(document: OKRDocument): OkrStickyViewModel {
    const viewModel = this.projection.project(document);
    this.viewModelSubject.next(viewModel);
    return viewModel;
  }

  addKeyResult(): void {
    const current = this.viewModelSubject.getValue();
    if (!current) return;
    const id =
      globalThis.crypto && 'randomUUID' in globalThis.crypto
        ? (globalThis.crypto as { randomUUID: () => string }).randomUUID()
        : Math.random().toString(36).slice(2);
    const next = {
      ...current,
      keyResults: [
        ...current.keyResults,
        {
          id,
          statement: '新关键结果',
          metricLabel: null,
          ownerLabel: null,
        },
      ],
    } satisfies OkrStickyViewModel;
    this.viewModelSubject.next(next);
  }

  /**
   * 从主进程恢复最近的 OKR 文档
   *
   * 在构造函数中自动调用，尝试从主进程获取持久化的最新 OKR 文档
   * 并更新到当前状态中。如果主进程没有保存的文档或解析失败，则静默忽略。
   *
   * @returns Promise 在恢复完成后解析（无论成功与否）
   * @throws 不会抛出错误，所有异常都被捕获并记录
   *
   * @example
   * // 通常在服务初始化时自动调用
   * await gateway.hydrateFromMain();
   * // 如果有保存的 OKR，viewModel$ 会立即发出新值
   */
  private async hydrateFromMain(): Promise<void> {
    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      return;
    }

    try {
      const latest = await bridge.invoke(IPC_CHANNELS.OKR_LATEST, undefined);
      const parsed = okrDocumentSchema.safeParse(latest);
      if (parsed.success) {
        this.logger.info('[renderer] hydrated sticky note from persisted OKR', parsed.data.id);
        this.storeDocument(parsed.data);
      }
    } catch (error) {
      this.logger.error('[renderer] failed to hydrate sticky note', error);
    }
  }

  private ensureBridge(): ClarifyOkrApi {
    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      throw new Error('ClarifyOKR bridge is unavailable.');
    }
    return bridge;
  }

  private bridgeOrUndefined(): ClarifyOkrApi | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }
    return window.clarifyOkr;
  }
}
