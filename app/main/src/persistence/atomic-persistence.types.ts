/**
 * Atomic Persistence Types
 */

/**
 * Persistence metrics
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
 * Persistence result
 */
export interface PersistenceResult {
  success: boolean;
  backupCreated: boolean;
  latencyMs: number;
  error?: Error;
}

/**
 * Recovery result
 */
export interface RecoveryResult<T = unknown> {
  success: boolean;
  recoveredFrom: string | null;
  timestamp: Date;
  data?: T;
}

/**
 * Persisted payload structure
 */
export interface PersistedPayload<T = unknown> {
  checksum: string;
  timestamp: string;
  data: T;
}
