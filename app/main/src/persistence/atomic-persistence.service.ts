import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';


import { Logger } from '../core/logger.js';
import { BackupStrategy } from './backup-strategy.js';
import { PersistenceMetricsCollector, type PersistenceMetrics } from './persistence-metrics.js';

export interface PersistenceResult {
  success: boolean;
  backupCreated: boolean;
  latencyMs: number;
  error?: Error;
}

export interface RecoveryResult<T = unknown> {
  success: boolean;
  recoveredFrom: string | null;
  timestamp: Date;
  data?: T;
}

interface PersistedPayload<T = unknown> {
  checksum: string;
  timestamp: string;
  data: T;
}

/**
 * Atomic persistence service implementing write-to-temp-then-rename pattern.
 * Maintains 3 backup versions for crash recovery.
 */
export class AtomicPersistenceService {
  private readonly backupStrategy: BackupStrategy;
  private readonly metrics: PersistenceMetricsCollector;
  private readonly tempSuffix = '.tmp';

  constructor() {
    this.backupStrategy = new BackupStrategy();
    this.metrics = new PersistenceMetricsCollector();
  }

  /**
   * Atomically write data to a file with backup support.
   */
  async atomicWrite<T>(filePath: string, data: T): Promise<PersistenceResult> {
    const startTime = performance.now();

    try {
      await fs.mkdir(dirname(filePath), { recursive: true });

      let backupCreated = false;
      try {
        await fs.access(filePath);
        await this.backupStrategy.createBackup(filePath);
        backupCreated = true;
        this.metrics.recordBackup();
      } catch {
        Logger.debug('[AtomicPersistenceService] File does not exist, no backup needed');
      }

      const tempPath = filePath + this.tempSuffix;
      const jsonData = JSON.stringify(data, null, 2);
      const checksum = this.calculateChecksum(jsonData);
      const payload = JSON.stringify({
        checksum,
        timestamp: new Date().toISOString(),
        data,
      });

      await fs.writeFile(tempPath, payload, 'utf-8');
      await fs.rename(tempPath, filePath);

      if (!(await this.verifyFile(filePath, checksum))) {
        throw new Error('File verification failed after write');
      }

      const latency = performance.now() - startTime;
      this.metrics.recordWrite(latency);

      return { success: true, backupCreated, latencyMs: latency };
    } catch (error) {
      const latency = performance.now() - startTime;
      this.metrics.recordWriteError(latency);

      try {
        await fs.unlink(filePath + this.tempSuffix);
      } catch {
        Logger.debug('[AtomicPersistenceService] Failed to clean up temp file (may not exist)');
      }

      return {
        success: false,
        backupCreated: false,
        latencyMs: latency,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Atomically read a file with verification and backup recovery.
   */
  async atomicRead<T>(filePath: string): Promise<RecoveryResult<T>> {
    const startTime = performance.now();

    try {
      const result = await this.readAndVerify<T>(filePath);

      if (result.success) {
        const latency = performance.now() - startTime;
        this.metrics.recordRead(latency);
        return { success: true, recoveredFrom: null, timestamp: new Date(), data: result.data };
      }

      return await this.recoverFromBackup<T>(filePath);
    } catch (error) {
      this.metrics.recordReadError(performance.now() - startTime);
      return await this.recoverFromBackup<T>(filePath);
    }
  }

  /**
   * Clean up orphaned temporary files.
   */
  async cleanupOrphanedTempFiles(dataDir: string): Promise<string[]> {
    const cleaned: string[] = [];

    try {
      const entries = await fs.readdir(dataDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(this.tempSuffix)) {
          const tempPath = join(dataDir, entry.name);
          const mainPath = tempPath.slice(0, -this.tempSuffix.length);

          try {
            await fs.access(mainPath);
            await fs.unlink(tempPath);
            cleaned.push(tempPath);
          } catch {
            Logger.debug(
              '[AtomicPersistenceService] Main file not found, attempting recovery from temp',
            );
            await this.recoverFromTempFile(tempPath);
            cleaned.push(tempPath);
          }
        }
      }
    } catch (error) {
      Logger.debug(
        '[AtomicPersistenceService] Failed to read directory for cleanup',
        error instanceof Error ? error.message : String(error),
      );
    }

    return cleaned;
  }

  /**
   * Get current persistence metrics.
   */
  getMetrics(): PersistenceMetrics {
    return this.metrics.getMetrics();
  }

  /**
   * Reset all metrics.
   */
  resetMetrics(): void {
    this.metrics.reset();
  }

  // ========== Private Methods ==========

  private calculateChecksum(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private async verifyFile(filePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content) as PersistedPayload;

      if (!parsed.checksum || !parsed.data) {
        return false;
      }

      const jsonData = JSON.stringify(parsed.data, null, 2);
      const actualChecksum = this.calculateChecksum(jsonData);

      return actualChecksum === expectedChecksum;
    } catch (error) {
      Logger.debug(
        '[AtomicPersistenceService] File verification failed',
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  private async readAndVerify<T>(filePath: string): Promise<{ success: boolean; data?: T }> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content) as PersistedPayload<T>;

      if (!parsed.checksum || !parsed.data) {
        this.metrics.recordChecksumFailure();
        return { success: false };
      }

      const jsonData = JSON.stringify(parsed.data, null, 2);
      const actualChecksum = this.calculateChecksum(jsonData);

      if (actualChecksum !== parsed.checksum) {
        this.metrics.recordChecksumFailure();
        return { success: false };
      }

      return { success: true, data: parsed.data };
    } catch (error) {
      Logger.debug(
        '[AtomicPersistenceService] Read and verify failed',
        error instanceof Error ? error.message : String(error),
      );
      return { success: false };
    }
  }

  private async recoverFromBackup<T>(filePath: string): Promise<RecoveryResult<T>> {
    const { baseName, dir } = this.backupStrategy.parseFilePath(filePath);
    const latestBackup = await this.backupStrategy.getLatestBackup(dir, baseName);

    if (latestBackup) {
      try {
        const result = await this.readAndVerify<T>(latestBackup);
        if (result.success && result.data) {
          await fs.copyFile(latestBackup, filePath);
          this.metrics.recordRecovery();
          return {
            success: true,
            recoveredFrom: latestBackup,
            timestamp: new Date(),
            data: result.data,
          };
        }
      } catch (error) {
        Logger.debug(
          '[AtomicPersistenceService] Backup verification failed, trying next',
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return { success: false, recoveredFrom: null, timestamp: new Date(), data: undefined };
  }

  private async recoverFromTempFile(tempPath: string): Promise<void> {
    try {
      const content = await fs.readFile(tempPath, 'utf-8');
      const parsed = JSON.parse(content) as PersistedPayload;

      if (parsed.checksum && parsed.data) {
        const jsonData = JSON.stringify(parsed.data, null, 2);
        const actualChecksum = this.calculateChecksum(jsonData);

        if (actualChecksum === parsed.checksum) {
          const mainPath = tempPath.slice(0, -this.tempSuffix.length);
          await fs.rename(tempPath, mainPath);
          this.metrics.recordRecovery();
        } else {
          await fs.unlink(tempPath);
        }
      } else {
        await fs.unlink(tempPath);
      }
    } catch (error) {
      Logger.debug(
        '[AtomicPersistenceService] Failed to recover from temp file',
        error instanceof Error ? error.message : String(error),
      );
      try {
        await fs.unlink(tempPath);
      } catch (unlinkError) {
        Logger.debug(
          '[AtomicPersistenceService] Failed to delete temp file',
          unlinkError instanceof Error ? unlinkError.message : String(unlinkError),
        );
      }
    }
  }
}

// Export singleton instance
export const atomicPersistence = new AtomicPersistenceService();
