import type { OnDestroy } from '@angular/core';
import { Injectable, inject, signal } from '@angular/core';
import type { Logger } from '@core/services/logger.service';
import { TelemetryService } from '@services/telemetry.service';
import { ClarificationStateMachine } from './clarification-state-machine.service';
import {
  type TelemetryEventType,
  type TelemetryEvent,
  type StepViewPayload,
  type OptionSelectPayload,
  type CompletionPayload,
  type DropOffPayload,
  type TimingPayload,
  type TelemetryConfig,
} from './clarification-telemetry.types';
import {
  DEFAULT_CONFIG,
  TELEMETRY_OPT_OUT_KEY,
  TELEMETRY_CONFIG_KEY,
  successFromDuration,
} from './clarification-telemetry.config';

/**
 * ClarificationTelemetryService - Feature-specific telemetry for the clarification workflow
 *
 * Tracks user interactions throughout the clarification process, providing detailed
 * analytics on user engagement, completion rates, and drop-off points. This service
 * extends the base telemetry capabilities with clarification-specific event types
 * and automatic state monitoring.
 *
 * Key Responsibilities:
 * - Track step views and navigation patterns
 * - Record option selections with timing data
 * - Monitor completion and drop-off events
 * - Collect performance timing metrics
 * - Provide privacy-first opt-out support
 * - Batch events for efficient transmission
 *
 * Telemetry Events:
 * - step_view: User views a clarification step
 * - option_select: User selects an answer option
 * - completion: User completes the clarification flow
 * - drop_off: User abandons the clarification flow
 * - timing: Performance measurements
 * - error: Errors encountered during the flow
 *
 * @module clarification/services/clarification-telemetry.service
 *
 * @usage
 * ```typescript
 * // In a component
 * constructor(private telemetry: ClarificationTelemetryService) {}
 *
 * // Track step view
 * this.telemetry.trackStepView({
 *   stepId: 'intent-input',
 *   stepName: 'Enter your intent',
 *   stepIndex: 1,
 *   totalSteps: 5
 * });
 *
 * // Track option selection
 * this.telemetry.trackOptionSelect({
 *   promptId: 'priority',
 *   optionId: 'efficiency',
 *   optionLabel: 'Improve efficiency',
 *   selectionIndex: 2
 * });
 *
 * // Track completion
 * this.telemetry.trackCompletion(true);
 *
 * // Check if telemetry is enabled
 * if (this.telemetry.isEnabled()) {
 *   // Perform tracked operations
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ClarificationTelemetryService implements OnDestroy {
  private readonly stateMachine = inject(ClarificationStateMachine);
  private readonly baseTelemetry = inject(TelemetryService);
  private readonly logger: Logger;

  /** 事件队列 */
  private eventQueue: TelemetryEvent[] = [];

  /** 批量发送定时器 */
  private batchTimer: ReturnType<typeof setInterval> | null = null;

  /** 会话开始时间 */
  private sessionStartTime = Date.now();

  /** 当前步骤进入时间 */
  private stepStartTime = Date.now();

  /** 当前步骤ID */
  private currentStepId: string | null = null;

  /** 配置 */
  private config: TelemetryConfig;

  /** 是否已选择退出(响应式Signal) */
  readonly isOptedOut = signal<boolean>(false);

  /** 待发送事件数量(响应式Signal) */
  readonly pendingEventCount = signal<number>(0);

  /** 当前会话ID */
  readonly currentSessionId = signal<string | null>(null);

  constructor(logger: Logger) {
    this.logger = logger;
    this.config = this.loadConfig();
    this.isOptedOut.set(this.checkOptOutStatus());
    this.currentSessionId.set(this.stateMachine.sessionId());

    this.initializeBatchTimer();
    this.setupStateMonitoring();

    this.logger.debug('[TELEMETRY] Service initialized', {
      enabled: this.config.enabled,
      optedOut: this.isOptedOut(),
    });
  }

  /**
   * 清理资源
   */
  ngOnDestroy(): void {
    this.flushEvents();
    this.clearBatchTimer();
    this.logger.debug('[TELEMETRY] Service destroyed, events flushed');
  }

  // ==================== 公共API ====================

  /**
   * 检查遥测是否启用
   * @returns 是否允许收集遥测数据
   */
  isEnabled(): boolean {
    return this.config.enabled && !this.isOptedOut();
  }

  /**
   * 选择退出遥测收集
   * 会立即停止收集并清空待发送队列
   */
  optOut(): void {
    this.isOptedOut.set(true);
    localStorage.setItem(TELEMETRY_OPT_OUT_KEY, 'true');
    this.eventQueue = []; // 清空队列
    this.pendingEventCount.set(0);
    this.logger.info('[TELEMETRY] User opted out of telemetry');
  }

  /**
   * 重新启用遥测收集
   */
  optIn(): void {
    this.isOptedOut.set(false);
    localStorage.removeItem(TELEMETRY_OPT_OUT_KEY);
    this.logger.info('[TELEMETRY] User opted in to telemetry');
  }

  /**
   * 获取当前opt-out状态
   */
  getOptOutStatus(): boolean {
    return this.isOptedOut();
  }

  /**
   * 记录步骤查看事件
   * @param payload - 步骤信息
   */
  trackStepView(payload: StepViewPayload): void {
    if (!this.shouldTrack()) return;

    const timeSpentMs = this.currentStepId ? Date.now() - this.stepStartTime : undefined;

    // 记录上一步的时间
    if (this.currentStepId && timeSpentMs) {
      this.trackEvent('step_view', {
        ...payload,
        timeSpentMs,
        previousStepId: this.currentStepId,
      });
    } else {
      this.trackEvent('step_view', payload);
    }

    // 更新当前步骤计时
    this.currentStepId = payload.stepId;
    this.stepStartTime = Date.now();

    this.logger.debug('[TELEMETRY] Step view tracked', payload);
  }

  /**
   * 记录选项选择事件
   * @param payload - 选择信息
   */
  trackOptionSelect(payload: OptionSelectPayload): void {
    if (!this.shouldTrack()) return;

    this.trackEvent('option_select', payload);
    this.logger.debug('[TELEMETRY] Option select tracked', payload);
  }

  /**
   * 记录流程完成事件
   * @param success - 是否成功完成
   */
  trackCompletion(success: boolean): void {
    if (!this.shouldTrack()) return;

    const totalTimeMs = Date.now() - this.sessionStartTime;
    const selections = this.stateMachine.selections();

    const payload: CompletionPayload = {
      totalSteps: this.stateMachine.history().length + 1,
      totalTimeMs,
      selectionsCount: Object.keys(selections).length,
      success,
    };

    this.trackEvent('completion', payload);
    this.flushEvents(); // 立即发送完成事件
    this.logger.debug('[TELEMETRY] Completion tracked', payload);
  }

  /**
   * 记录用户流失事件
   * @param reason - 流失原因
   */
  trackDropOff(reason: DropOffPayload['reason'] = 'unknown'): void {
    if (!this.shouldTrack()) return;

    const timeSpentMs = Date.now() - this.sessionStartTime;
    const selections = this.stateMachine.selections();
    const currentPrompt = this.stateMachine.currentPrompt();

    const payload: DropOffPayload = {
      stepId: currentPrompt?.id ?? 'unknown',
      stepName: currentPrompt?.question ?? 'Unknown Step',
      timeSpentMs,
      selectionsCount: Object.keys(selections).length,
      reason,
    };

    this.trackEvent('drop_off', payload);
    this.flushEvents(); // 立即发送流失事件
    this.logger.debug('[TELEMETRY] Drop-off tracked', payload);
  }

  /**
   * 记录性能计时指标
   * @param metric - 指标名称
   * @param durationMs - 持续时间(毫秒)
   * @param context - 附加上下文
   */
  trackTiming(metric: string, durationMs: number, context?: Record<string, unknown>): void {
    if (!this.shouldTrack() || !this.config.collectPerformanceMetrics) return;

    const payload: TimingPayload = {
      metric,
      durationMs,
      context,
    };

    this.trackEvent('timing', payload);
    this.baseTelemetry.recordCall('clarification', successFromDuration(durationMs), durationMs);
  }

  /**
   * 记录错误事件
   * @param error - 错误信息
   * @param context - 错误上下文
   */
  trackError(error: Error | string, context?: Record<string, unknown>): void {
    if (!this.shouldTrack()) return;

    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    this.trackEvent('error', {
      message: errorMessage,
      stack: errorStack,
      ...context,
    });

    this.logger.debug('[TELEMETRY] Error tracked', { message: errorMessage });
  }

  /**
   * 手动刷新事件队列
   * 将所有待发送事件立即提交
   */
  flushEvents(): void {
    if (this.eventQueue.length === 0) return;

    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];
    this.pendingEventCount.set(0);

    this.sendEvents(eventsToSend);
  }

  /**
   * 获取当前待发送事件数量
   */
  getPendingEventCount(): number {
    return this.eventQueue.length;
  }

  /**
   * 更新配置
   * @param config - 部分配置选项
   */
  updateConfig(config: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();

    // 如果禁用，清空队列
    if (!this.config.enabled) {
      this.eventQueue = [];
      this.pendingEventCount.set(0);
    }

    this.logger.debug('[TELEMETRY] Config updated', this.config);
  }

  /**
   * 获取当前配置
   */
  getConfig(): TelemetryConfig {
    return { ...this.config };
  }

  // ==================== 私有方法 ====================

  /**
   * 生成唯一事件ID
   */
  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 检查是否应该跟踪事件
   */
  private shouldTrack(): boolean {
    if (!this.config.enabled || this.isOptedOut()) {
      return false;
    }

    // 采样率检查
    if (Math.random() > this.config.sampleRate) {
      return false;
    }

    return true;
  }

  /**
   * 创建并队列事件
   */
  private trackEvent(type: TelemetryEventType, payload: object): void {
    const event: TelemetryEvent = {
      id: this.generateEventId(),
      type,
      timestamp: Date.now(),
      sessionId: this.stateMachine.sessionId(),
      payload,
    };

    this.eventQueue.push(event);
    this.pendingEventCount.set(this.eventQueue.length);

    // 检查是否达到批量阈值
    if (this.eventQueue.length >= this.config.batchSizeThreshold) {
      this.flushEvents();
    }
  }

  /**
   * 初始化批量发送定时器
   */
  private initializeBatchTimer(): void {
    this.clearBatchTimer();
    this.batchTimer = setInterval(() => {
      this.flushEvents();
    }, this.config.batchIntervalMs);
  }

  /**
   * 清理批量发送定时器
   */
  private clearBatchTimer(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * 发送事件到遥测服务
   * @param events - 要发送的事件数组
   */
  private sendEvents(events: TelemetryEvent[]): void {
    if (events.length === 0) return;

    try {
      // 这里可以扩展到实际的遥测后端
      // 目前使用基础的TelemetryService并记录到控制台(开发环境)
      this.logger.debug('[TELEMETRY] Sending batch', {
        count: events.length,
        events: events.map((e) => ({ type: e.type, timestamp: e.timestamp })),
      });

      // 统计事件类型
      const typeCounts = events.reduce(
        (acc, event) => {
          acc[event.type] = (acc[event.type] ?? 0) + 1;
          return acc;
        },
        {} as Record<TelemetryEventType, number>,
      );

      // 记录到基础遥测服务
      Object.entries(typeCounts).forEach(([type, count]) => {
        for (let i = 0; i < count; i++) {
          this.baseTelemetry.recordCall(`clarification:${type}`, 'success', 0);
        }
      });

      // 触发自定义事件(用于测试和调试)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('clarityokr:telemetry:batch', {
            detail: { events, timestamp: Date.now() },
          }),
        );
      }
    } catch (error) {
      this.logger.error('[TELEMETRY] Failed to send events', error);
    }
  }

  /**
   * 设置状态机监控
   * 自动跟踪状态变化
   */
  private setupStateMonitoring(): void {
    // 监听会话ID变化
    const sessionId = this.stateMachine.sessionId();
    if (sessionId !== this.currentSessionId()) {
      this.currentSessionId.set(sessionId);
      this.sessionStartTime = Date.now();
      this.stepStartTime = Date.now();
    }

    // 监听当前提示变化(步骤变化)
    const currentPrompt = this.stateMachine.currentPrompt();
    if (currentPrompt && currentPrompt.id !== this.currentStepId) {
      this.trackStepView({
        stepId: currentPrompt.id,
        stepName: currentPrompt.question,
        stepIndex: this.stateMachine.history().length,
        totalSteps: this.stateMachine.history().length + 1, // 估计值
      });
    }

    // 监听错误状态
    const error = this.stateMachine.error();
    if (error) {
      this.trackError(error.message, {
        recoverable: error.recoverable,
        workflowState: this.stateMachine.workflowState(),
      });
    }
  }

  /**
   * 检查本地存储的opt-out状态
   */
  private checkOptOutStatus(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(TELEMETRY_OPT_OUT_KEY) === 'true';
  }

  /**
   * 从本地存储加载配置
   */
  private loadConfig(): TelemetryConfig {
    if (typeof window === 'undefined') return DEFAULT_CONFIG;

    try {
      const stored = localStorage.getItem(TELEMETRY_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<TelemetryConfig>;
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch {
      this.logger.warn('[TELEMETRY] Failed to load config from storage');
    }

    return DEFAULT_CONFIG;
  }

  /**
   * 保存配置到本地存储
   */
  private saveConfig(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(TELEMETRY_CONFIG_KEY, JSON.stringify(this.config));
    } catch {
      this.logger.warn('[TELEMETRY] Failed to save config to storage');
    }
  }
}
