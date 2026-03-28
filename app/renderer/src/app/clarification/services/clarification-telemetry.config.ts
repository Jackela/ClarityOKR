/**
 * Clarification Telemetry Configuration
 *
 * Default configuration and constants for the telemetry system.
 */

import type { TelemetryConfig } from './clarification-telemetry.types.js';

/**
 * 默认遥测配置
 */
export const DEFAULT_CONFIG: TelemetryConfig = {
  enabled: true,
  batchIntervalMs: 30000, // 30秒
  batchSizeThreshold: 10,
  collectPerformanceMetrics: true,
  sampleRate: 1.0,
};

/**
 * 本地存储键名
 */
export const TELEMETRY_OPT_OUT_KEY = 'clarityokr:telemetry:opt-out';
export const TELEMETRY_CONFIG_KEY = 'clarityokr:telemetry:config';

/**
 * 根据持续时间判断成功/超时
 * @param durationMs - 持续时间(毫秒)
 * @returns 结果状态
 */
export function successFromDuration(durationMs: number): 'success' | 'timeout' {
  return durationMs > 30000 ? 'timeout' : 'success';
}
