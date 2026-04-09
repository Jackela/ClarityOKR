/**
 * Telemetry Service - Application-level performance and usage tracking
 *
 * This service provides lightweight telemetry collection for tracking API call
 * outcomes and latency distributions across the application. It maintains
 * in-memory counters and latency histograms for performance analysis.
 *
 * Key Responsibilities:
 * - Track operation outcomes (success, error, timeout, invalid)
 * - Collect latency percentiles (p50, p90) for performance monitoring
 * - Maintain rolling window of recent latencies (last 1000 calls)
 * - Provide snapshot API for telemetry data export
 *
 * Metrics Tracked:
 * - Counter metrics: operation:outcome combinations
 * - Latency metrics: p50 and p90 percentiles
 * - Rolling window: last 1000 latency measurements
 *
 * @module services/telemetry.service
 *
 * @example
 * ```typescript
 * // In a component or service
 * constructor(private telemetry: TelemetryService) {}
 *
 * // Record a successful API call
 * this.telemetry.recordCall('api/getUser', 'success', 150);
 *
 * // Record an error
 * this.telemetry.recordCall('api/getUser', 'error', 0);
 *
 * // Get telemetry snapshot
 * const snapshot = this.telemetry.snapshot();
 * console.log('Success rate:', snapshot.counters);
 * console.log('p50 latency:', snapshot.p50, 'ms');
 * ```
 */

import { Injectable } from '@angular/core';

/**
 * Outcome types for telemetry tracking.
 *
 * Represents the possible results of an operation:
 * - success: Operation completed successfully
 * - error: Operation failed with an error
 * - timeout: Operation exceeded time limit
 * - invalid: Operation returned invalid/unexpected data
 */
type Outcome = 'success' | 'error' | 'timeout' | 'invalid';

/**
 * Service for collecting application telemetry and performance metrics.
 *
 * This service tracks operation outcomes and latency distributions to help
 * monitor application health and performance. Data is stored in memory and
 * provides percentile calculations for latency analysis.
 *
 * The service maintains:
 * - Counter map for operation:outcome combinations
 * - Rolling array of last 1000 latency measurements
 * - p50 and p90 percentile calculations
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class ApiService {
 *   constructor(private telemetry: TelemetryService) {}
 *
 *   async fetchData(): Promise<Data> {
 *     const start = performance.now();
 *     try {
 *       const result = await this.http.get('/api/data');
 *       this.telemetry.recordCall('fetchData', 'success', performance.now() - start);
 *       return result;
 *     } catch (error) {
 *       this.telemetry.recordCall('fetchData', 'error', performance.now() - start);
 *       throw error;
 *     }
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class TelemetryService {
  /**
   * Counter map storing operation:outcome counts.
   *
   * Keys are formatted as "operation:outcome" (e.g., "api/getUser:success").
   * Values are the total count of occurrences.
   */
  private counters = new Map<string, number>();

  /**
   * Rolling array of latency measurements (milliseconds).
   *
   * Limited to last 1000 measurements to prevent unbounded growth.
   * Used for percentile calculations in snapshot().
   */
  private latencies: number[] = [];

  /**
   * Records a telemetry event for an operation.
   *
   * Increments the counter for the operation:outcome combination and
   * stores the latency measurement. Latency data is maintained in a
   * rolling window of the last 1000 measurements.
   *
   * @param operation - Identifier for the operation (e.g., 'api/getUser', 'llm/generate')
   * @param outcome - Result of the operation: 'success', 'error', 'timeout', or 'invalid'
   * @param ms - Duration of the operation in milliseconds
   *
   * @example
   * ```typescript
   * // Record a fast successful database query
   * telemetry.recordCall('db/query', 'success', 25);
   *
   * // Record a slow API call that timed out
   * telemetry.recordCall('api/external', 'timeout', 5000);
   *
   * // Record a validation failure
   * telemetry.recordCall('input/validate', 'invalid', 0);
   * ```
   */
  recordCall(operation: string, outcome: Outcome, ms: number): void {
    this.bump(`${operation}:${outcome}`);
    this.latencies.push(ms);
    if (this.latencies.length > 1000) this.latencies.shift();
  }

  /**
   * Increments a counter metric.
   *
   * @param key - The counter key to increment
   */
  private bump(key: string): void {
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  /**
   * Returns a snapshot of current telemetry data.
   *
   * Provides counter totals and calculated latency percentiles (p50, p90)
   * based on the rolling window of measurements.
   *
   * @returns Object containing counters and latency percentiles
   * @returns counters - Record of operation:outcome counts
   * @returns p50 - 50th percentile latency (median) in milliseconds
   * @returns p90 - 90th percentile latency in milliseconds
   *
   * @example
   * ```typescript
   * const snapshot = telemetry.snapshot();
   *
   * // Access individual counters
   * const successCount = snapshot.counters['api/getUser:success'] ?? 0;
   * const errorCount = snapshot.counters['api/getUser:error'] ?? 0;
   * const successRate = successCount / (successCount + errorCount);
   *
   * // Access latency percentiles
   * console.log(`Median latency: ${snapshot.p50}ms`);
   * console.log(`90th percentile: ${snapshot.p90}ms`);
   *
   * // Export for monitoring
   * sendToMonitoring({
   *   counters: snapshot.counters,
   *   latencies: { p50: snapshot.p50, p90: snapshot.p90 }
   * });
   * ```
   */
  snapshot(): { counters: Record<string, number>; p50: number; p90: number } {
    const entries = Array.from(this.counters.entries());
    const counters = Object.fromEntries(entries);
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const q = (p: number) =>
      sorted.length ? sorted[Math.floor((p / 100) * (sorted.length - 1))] : 0;
    return { counters, p50: q(50), p90: q(90) };
  }
}
