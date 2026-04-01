/**
 * Performance metrics for persistence operations
 */
export interface PersistenceMetrics {
  writeLatency: number;
  writeCount: number;
  writeErrors: number;
  readLatency: number;
  readCount: number;
  readErrors: number;
  backupCount: number;
  recoveryCount: number;
  checksumFailures: number;
}

/**
 * Initial metrics state
 */
const INITIAL_METRICS: PersistenceMetrics = {
  writeLatency: 0,
  writeCount: 0,
  writeErrors: 0,
  readLatency: 0,
  readCount: 0,
  readErrors: 0,
  backupCount: 0,
  recoveryCount: 0,
  checksumFailures: 0,
};

/**
 * Service for collecting and managing persistence metrics.
 * Thread-safe through immutable updates.
 */
export class PersistenceMetricsCollector {
  private metrics: PersistenceMetrics = { ...INITIAL_METRICS };

  /**
   * Record a successful write operation.
   * @param latencyMs - Write latency in milliseconds
   */
  recordWrite(latencyMs: number): void {
    this.metrics = {
      ...this.metrics,
      writeCount: this.metrics.writeCount + 1,
      writeLatency: this.calculateRunningAverage(
        this.metrics.writeLatency,
        this.metrics.writeCount,
        latencyMs,
      ),
    };
  }

  /**
   * Record a failed write operation.
   * @param latencyMs - Write latency in milliseconds (time before failure)
   */
  recordWriteError(latencyMs: number): void {
    this.metrics = {
      ...this.metrics,
      writeCount: this.metrics.writeCount + 1,
      writeErrors: this.metrics.writeErrors + 1,
      writeLatency: this.calculateRunningAverage(
        this.metrics.writeLatency,
        this.metrics.writeCount,
        latencyMs,
      ),
    };
  }

  /**
   * Record a successful read operation.
   * @param latencyMs - Read latency in milliseconds
   */
  recordRead(latencyMs: number): void {
    this.metrics = {
      ...this.metrics,
      readCount: this.metrics.readCount + 1,
      readLatency: this.calculateRunningAverage(
        this.metrics.readLatency,
        this.metrics.readCount,
        latencyMs,
      ),
    };
  }

  /**
   * Record a failed read operation.
   * @param latencyMs - Read latency in milliseconds (time before failure)
   */
  recordReadError(latencyMs: number): void {
    this.metrics = {
      ...this.metrics,
      readCount: this.metrics.readCount + 1,
      readErrors: this.metrics.readErrors + 1,
      readLatency: this.calculateRunningAverage(
        this.metrics.readLatency,
        this.metrics.readCount,
        latencyMs,
      ),
    };
  }

  /**
   * Record a backup creation.
   */
  recordBackup(): void {
    this.metrics = {
      ...this.metrics,
      backupCount: this.metrics.backupCount + 1,
    };
  }

  /**
   * Record a successful recovery from backup.
   */
  recordRecovery(): void {
    this.metrics = {
      ...this.metrics,
      recoveryCount: this.metrics.recoveryCount + 1,
    };
  }

  /**
   * Record a checksum verification failure.
   */
  recordChecksumFailure(): void {
    this.metrics = {
      ...this.metrics,
      checksumFailures: this.metrics.checksumFailures + 1,
    };
  }

  /**
   * Get current metrics snapshot.
   * @returns Copy of current metrics
   */
  getMetrics(): PersistenceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset all metrics to initial state.
   */
  reset(): void {
    this.metrics = { ...INITIAL_METRICS };
  }

  /**
   * Calculate running average using exponential moving average.
   */
  private calculateRunningAverage(
    currentAvg: number,
    currentCount: number,
    newValue: number,
  ): number {
    return (currentAvg * currentCount + newValue) / (currentCount + 1);
  }
}
