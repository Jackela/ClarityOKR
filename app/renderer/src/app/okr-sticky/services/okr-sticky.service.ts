import { Injectable, type OnDestroy, signal, computed } from '@angular/core';
import type { GenerateOKRRequest, OKRDocument, RegenerationPolicy } from '@clarityokr/contracts';
import {
  BridgeUnavailableError,
  generateOKRRequestSchema,
  generateOKRResponseSchema,
  okrDocumentSchema,
} from '@clarityokr/contracts';

import type { Logger } from '../../core/services/logger.service';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import type { ClarifyOkrApi } from '../../shared/window';

/**
 * View model for individual Key Results in the sticky note display.
 */
export interface KeyResultViewModel {
  /** Unique identifier for the Key Result */
  id: string;
  /** The Key Result statement text */
  statement: string;
  /** Display label for the success metric (null if not specified) */
  metricLabel: string | null;
  /** Display label for the owner/assignee (null if not specified) */
  ownerLabel: string | null;
}

/**
 * View model for the OKR sticky note display.
 */
export interface OkrStickyViewModel {
  /** The main Objective statement */
  objective: string;
  /** Array of Key Results transformed for display */
  keyResults: KeyResultViewModel[];
  /** ISO timestamp when the OKR was first generated */
  generatedAt: string;
  /** ISO timestamp of last manual edit (null if never edited) */
  lastEditedAt: string | null;
  /** Whether the OKR has been manually edited since generation */
  hasManualEdits: boolean;
  /** Policy controlling regeneration behavior */
  regenerationPolicy: RegenerationPolicy;
}

/**
 * Consolidated OKR Sticky Service
 *
 * Combines gateway and projection functionality into a single service using Signals.
 * Manages sticky window lifecycle, IPC communication, and OKR document projection.
 *
 * Migrated from BehaviorSubject to Angular Signals for better performance and reactivity.
 *
 * @module okr-sticky/services/okr-sticky.service
 */
@Injectable({ providedIn: 'root' })
export class OkrStickyService implements OnDestroy {
  /** Internal signal for view model state */
  private readonly _viewModel = signal<OkrStickyViewModel | null>(null);

  /** IPC listener cleanup function */
  private okrListenerUnsubscribe?: () => void;

  /** Public readonly signal for view model */
  readonly viewModel = this._viewModel.asReadonly();

  /** Computed signal indicating if a sticky note exists */
  readonly hasStickyNote = computed(() => this._viewModel() !== null);

  /** Computed signal for current view model value (null-safe) */
  readonly currentViewModel = computed(() => this._viewModel());

  constructor(private readonly logger: Logger) {
    this.registerListeners();
    void this.hydrateFromMain();
  }

  ngOnDestroy(): void {
    if (this.okrListenerUnsubscribe) {
      this.okrListenerUnsubscribe();
      this.okrListenerUnsubscribe = undefined;
      this.logger.debug('[OKR-STICKY] IPC listener cleaned up');
    }
  }

  /**
   * Get the current view model value (synchronous)
   */
  getCurrentViewModel(): OkrStickyViewModel | null {
    return this._viewModel();
  }

  /**
   * Project an OKRDocument into an OkrStickyViewModel for UI display.
   *
   * Transforms the domain document into a view-optimized model.
   *
   * @param document - The OKRDocument from the domain layer
   * @returns The transformed OkrStickyViewModel ready for UI rendering
   * @throws Error if the document has no Key Results
   */
  project(document: OKRDocument): OkrStickyViewModel {
    if (!document.keyResults.length) {
      throw new Error('Key Results are required for sticky note rendering.');
    }

    return {
      objective: document.objective,
      keyResults: document.keyResults.map((kr) => ({
        id: kr.id,
        statement: kr.statement,
        metricLabel: kr.successMetric ?? null,
        ownerLabel: kr.owner ?? null,
      })),
      generatedAt: document.generatedAt,
      lastEditedAt: document.lastEditedAt ?? null,
      hasManualEdits: document.manualEdits.length > 0,
      regenerationPolicy: document.regenerationPolicy,
    };
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
   */
  async reopenSticky(): Promise<void> {
    const bridge = this.ensureBridge();
    await bridge.invoke(IPC_CHANNELS.STICKY_REOPEN, undefined);
  }

  /**
   * 添加 Key Result
   *
   * 在本地状态中动态添加一个新的 Key Result。
   * 这是一个本地操作，不涉及 IPC 调用。
   */
  addKeyResult(): void {
    const current = this._viewModel();
    if (!current) return;

    const id =
      globalThis.crypto && 'randomUUID' in globalThis.crypto
        ? (globalThis.crypto as { randomUUID: () => string }).randomUUID()
        : Math.random().toString(36).slice(2);

    const next: OkrStickyViewModel = {
      ...current,
      keyResults: [
        ...current.keyResults,
        {
          id,
          statement: 'New Key Result',
          metricLabel: null,
          ownerLabel: null,
        },
      ],
    };

    this._viewModel.set(next);
  }

  /**
   * 注册 IPC 监听器
   *
   * 监听来自主进程的 OKR 生成事件，自动更新本地状态。
   */
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

    this.logger.debug('[OKR-STICKY] IPC listeners registered');
  }

  /**
   * Store document and project to view model
   */
  private storeDocument(document: OKRDocument): OkrStickyViewModel {
    const viewModel = this.project(document);
    this._viewModel.set(viewModel);
    return viewModel;
  }

  /**
   * 从主进程恢复最近的 OKR 文档
   *
   * 在构造函数中自动调用，尝试从主进程获取持久化的最新 OKR 文档
   * 并更新到当前状态中。如果主进程没有保存的文档或解析失败，则静默忽略。
   *
   * @returns Promise 在恢复完成后解析（无论成功与否）
   * @throws 不会抛出错误，所有异常都被捕获并记录
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

  /**
   * Ensure bridge is available
   */
  private ensureBridge(): ClarifyOkrApi {
    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
        throw new BridgeUnavailableError();
    }
    return bridge;
  }

  /**
   * Get bridge or undefined
   */
  private bridgeOrUndefined(): ClarifyOkrApi | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }
    return window.clarifyOkr;
  }

  /**
   * Clear the current view model
   */
  clear(): void {
    this._viewModel.set(null);
    this.logger.debug('[OKR-STICKY] View model cleared');
  }

  /**
   * Update the view model directly (for testing/manual updates)
   */
  updateViewModel(viewModel: OkrStickyViewModel | null): void {
    this._viewModel.set(viewModel);
    this.logger.debug('[OKR-STICKY] View model updated manually');
  }
}
