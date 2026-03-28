import type { OnDestroy} from '@angular/core';
import { Injectable, inject, signal } from '@angular/core';
import type { Logger } from '@core/services/logger.service';
import { TelemetryService } from '@services/telemetry.service';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { ClarificationStateMachine } from './clarification-state-machine.service';

/**
 * 遥测事件类型
 */
export type TelemetryEventType =
  | 'step_view' // 用户查看某个步骤
  | 'option_select' // 用户选择选项
  | 'completion' // 完成整个流程
  | 'drop_off' // 用户中途离开
  | 'error' // 发生错误
  | 'timing'; // 性能计时

/**
 * 遥测事件数据结构
 */
export interface TelemetryEvent {
  id: string;
  type: TelemetryEventType;
  timestamp: number;
  sessionId: string | null;
  payload: object;
}

/**
 * 步骤视图事件载荷
 */
export interface StepViewPayload {
  stepId: string;
  stepName: string;
  stepIndex: number;
  totalSteps: number;
  timeSpentMs?: number;
}

/**
 * 选项选择事件载荷
 */
export interface OptionSelectPayload {
  promptId: string;
  optionId: string;
  optionLabel: string;
  selectionIndex: number;
}

/**
 * 完成事件载荷
 */
export interface CompletionPayload {
  totalSteps: number;
  totalTimeMs: number;
  selectionsCount: number;
  success: boolean;
}

/**
 * 流失事件载荷
 */
export interface DropOffPayload {
  stepId: string;
  stepName: string;
  timeSpentMs: number;
  selectionsCount: number;
  reason?: 'navigation' | 'error' | 'timeout' | 'unknown';
}

/**
 * 性能计时事件载荷
 */
export interface TimingPayload {
  metric: string;
  durationMs: number;
  context?: Record<string, unknown>;
}

/**
 * 遥测配置选项
 */
export interface TelemetryConfig {
  /** 是否启用遥测收集 */
  enabled: boolean;
  /** 批量发送间隔(毫秒) */
  batchIntervalMs: number;
  /** 批量大小阈值 */
  batchSizeThreshold: number;
  /** 是否收集性能指标 */
  collectPerformanceMetrics: boolean;
  /** 采样率(0-1) */
  sampleRate: number;
}

/**
 * 默认遥测配置
 */
const DEFAULT_CONFIG: TelemetryConfig = {
  enabled: true,
  batchIntervalMs: 30000, // 30秒
  batchSizeThreshold: 10,
  collectPerformanceMetrics: true,
  sampleRate: 1.0,
};

/**
 * STORAGE_KEY - 本地存储键名
 */
const TELEMETRY_OPT_OUT_KEY = 'clarityokr:telemetry:opt-out';
const TELEMETRY_CONFIG_KEY = 'clarityokr:telemetry:config';

/**
 * ClarificationTelemetryService - 澄清流程遥测服务
 *
 * 负责跟踪用户在澄清流程中的所有交互行为，包括:
 * - 步骤浏览(step views)
 * - 选项选择(option selects)
 * - 完成率(completion)
 * - 流失分析(drop-offs)
 * - 性能指标(performance metrics)
 *
 * 特性:
 * - 批量事件收集，定期发送
 * - 隐私优先(支持opt-out)
 * - 自动会话跟踪
 * - 性能指标自动收集
 *
 * @usage
 * ```typescript
 * // 在组件中注入
 * constructor(private telemetry: ClarificationTelemetryService) {}
 *
 * // 记录步骤查看
 * this.telemetry.trackStepView({
 *   stepId: 'intent-input',
 *   stepName: '输入意图',
 *   stepIndex: 1,
 *   totalSteps: 5
 * });
 *
 * // 记录选项选择
 * this.telemetry.trackOptionSelect({
 *   promptId: 'prompt-1',
 *   optionId: 'opt-a',
 *   optionLabel: '提高效率',
 *   selectionIndex: 0
 * });
 *
 * // 检查是否允许遥测
 * if (this.telemetry.isEnabled()) {
 *   // 执行敏感跟踪
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

/**
 * 根据持续时间判断成功/超时
 * @param durationMs - 持续时间(毫秒)
 * @returns 结果状态
 */
function successFromDuration(durationMs: number): 'success' | 'timeout' {
  return durationMs > 30000 ? 'timeout' : 'success';
}
