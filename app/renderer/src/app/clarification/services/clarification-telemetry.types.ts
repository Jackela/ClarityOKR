/**
 * Clarification Telemetry Types
 *
 * Type definitions for the telemetry system.
 */

import type { ClarificationPrompt } from '@clarityokr/contracts';

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
 * 跟踪步骤视图的参数
 */
export interface TrackStepViewParams {
  prompt: ClarificationPrompt;
  stepIndex: number;
  totalSteps: number;
}
