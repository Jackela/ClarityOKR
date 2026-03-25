import { promises as fs } from 'node:fs';
import { dirname, join, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { Logger } from '../core/logger.js';

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
 * 原子持久化服务
 * 实现write-to-temp-then-rename模式，确保数据完整性
 * 维护3个备份版本，支持崩溃恢复
 */
export class AtomicPersistenceService {
  private readonly backupRetentionCount = 3;
  private readonly tempSuffix = '.tmp';
  private readonly backupSuffix = '.backup';
  private readonly lockSuffix = '.lock';
  private metrics: PersistenceMetrics;

  constructor() {
    this.metrics = {
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
  }

  /**
   * 原子写入文件
   * 1. 写入临时文件
   * 2. 创建备份（保留最后3个）
   * 3. 原子重命名
   * 4. 清理临时文件
   */
  async atomicWrite<T>(filePath: string, data: T): Promise<PersistenceResult> {
    const startTime = performance.now();

    try {
      // 确保目录存在
      await fs.mkdir(dirname(filePath), { recursive: true });

      // 1. 检查是否有现有的有效文件，如果有则创建备份
      let backupCreated = false;
      try {
        await fs.access(filePath);
        await this.createBackup(filePath);
        backupCreated = true;
        this.metrics.backupCount++;
      } catch {
        // 文件不存在，无需备份
        Logger.debug('[AtomicPersistenceService] File does not exist, no backup needed');
      }

      // 2. 写入临时文件
      const tempPath = filePath + this.tempSuffix;
      const jsonData = JSON.stringify(data, null, 2);

      // 添加数据校验和
      const checksum = this.calculateChecksum(jsonData);
      const payload = JSON.stringify({
        checksum,
        timestamp: new Date().toISOString(),
        data,
      });

      await fs.writeFile(tempPath, payload, 'utf-8');

      // 3. 原子重命名
      await fs.rename(tempPath, filePath);

      // 4. 验证写入
      const verified = await this.verifyFile(filePath, checksum);
      if (!verified) {
        throw new Error('File verification failed after write');
      }

      const latency = performance.now() - startTime;
      this.metrics.writeCount++;
      this.metrics.writeLatency =
        (this.metrics.writeLatency * (this.metrics.writeCount - 1) + latency) /
        this.metrics.writeCount;

      return {
        success: true,
        backupCreated,
        latencyMs: latency,
      };
    } catch (error) {
      const latency = performance.now() - startTime;
      this.metrics.writeErrors++;

      // 尝试清理临时文件
      try {
        await fs.unlink(filePath + this.tempSuffix);
      } catch {
        // 临时文件不存在或无法删除，这是预期的情况
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
   * 原子读取文件
   * 验证数据完整性，支持从备份恢复
   */
  async atomicRead<T>(filePath: string): Promise<RecoveryResult<T>> {
    const startTime = performance.now();

    try {
      // 尝试读取主文件
      const result = await this.readAndVerify<T>(filePath);

      if (result.success) {
        const latency = performance.now() - startTime;
        this.metrics.readCount++;
        this.metrics.readLatency =
          (this.metrics.readLatency * (this.metrics.readCount - 1) + latency) /
          this.metrics.readCount;

        return {
          success: true,
          recoveredFrom: null,
          timestamp: new Date(),
          data: result.data,
        };
      }

      // 主文件损坏，尝试从备份恢复
      return await this.recoverFromBackup<T>(filePath);
    } catch (error) {
      this.metrics.readErrors++;

      // 尝试从备份恢复
      return await this.recoverFromBackup<T>(filePath);
    }
  }

  /**
   * 清理孤立的临时文件
   * 在应用启动时调用
   */
  async cleanupOrphanedTempFiles(dataDir: string): Promise<string[]> {
    const cleaned: string[] = [];

    try {
      const entries = await fs.readdir(dataDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(this.tempSuffix)) {
          const tempPath = join(dataDir, entry.name);
          const mainPath = tempPath.slice(0, -this.tempSuffix.length);

          // 检查对应的主文件是否存在
          try {
            await fs.access(mainPath);
            // 主文件存在，临时文件是孤立的，可以删除
            await fs.unlink(tempPath);
            cleaned.push(tempPath);
          } catch {
            // 主文件不存在，这可能是写入中断，尝试恢复
            Logger.debug(
              '[AtomicPersistenceService] Main file not found, attempting recovery from temp',
            );
            await this.recoverFromTempFile(tempPath);
            cleaned.push(tempPath);
          }
        }
      }
    } catch (error) {
      // 目录不存在或无法读取，这是预期的错误
      Logger.debug(
        '[AtomicPersistenceService] Failed to read directory for cleanup',
        error instanceof Error ? error.message : String(error),
      );
    }

    return cleaned;
  }

  /**
   * 获取持久化指标
   */
  getMetrics(): PersistenceMetrics {
    return { ...this.metrics };
  }

  /**
   * 重置指标
   */
  resetMetrics(): void {
    this.metrics = {
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
  }

  // ========== 私有方法 ==========

  private async createBackup(filePath: string): Promise<void> {
    const baseName = basename(filePath, extname(filePath));
    const dir = dirname(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(dir, `${baseName}${this.backupSuffix}.${timestamp}.json`);

    await fs.copyFile(filePath, backupPath);
    await this.rotateBackups(dir, baseName);
  }

  private async rotateBackups(dir: string, baseName: string): Promise<void> {
    const pattern = new RegExp(`^${baseName}\\${this.backupSuffix}\\.[^\\.]+\\.json$`);

    try {
      const entries = await fs.readdir(dir);
      const backups = entries
        .filter((name) => pattern.test(name))
        .map((name) => join(dir, name))
        .sort((a, b) => {
          // 按时间戳排序（最新的在后面）
          const timeA = a.match(/\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/)?.[1] || '';
          const timeB = b.match(/\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/)?.[1] || '';
          return timeA.localeCompare(timeB);
        });

      // 删除旧的备份，只保留最后N个
      while (backups.length > this.backupRetentionCount) {
        const oldBackup = backups.shift();
        if (oldBackup) {
          try {
            await fs.unlink(oldBackup);
          } catch (error) {
            // 忽略删除错误（文件可能已被删除）
            Logger.debug(
              '[AtomicPersistenceService] Failed to delete old backup',
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      }
    } catch (error) {
      // 备份旋转过程中的错误，记录但不中断主流程
      Logger.debug(
        '[AtomicPersistenceService] Backup rotation error',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

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
      // 文件验证失败，可能是文件损坏或不存在
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
        this.metrics.checksumFailures++;
        return { success: false };
      }

      const jsonData = JSON.stringify(parsed.data, null, 2);
      const actualChecksum = this.calculateChecksum(jsonData);

      if (actualChecksum !== parsed.checksum) {
        this.metrics.checksumFailures++;
        return { success: false };
      }

      return { success: true, data: parsed.data };
    } catch (error) {
      // 读取或验证文件失败
      Logger.debug(
        '[AtomicPersistenceService] Read and verify failed',
        error instanceof Error ? error.message : String(error),
      );
      return { success: false };
    }
  }

  private async recoverFromBackup<T>(filePath: string): Promise<RecoveryResult<T>> {
    const baseName = basename(filePath, extname(filePath));
    const dir = dirname(filePath);
    const pattern = new RegExp(`^${baseName}\\${this.backupSuffix}\\.[^\\.]+\\.json$`);

    try {
      const entries = await fs.readdir(dir);
      const backups = entries
        .filter((name) => pattern.test(name))
        .map((name) => join(dir, name))
        .sort((a, b) => {
          // 按时间戳排序（最新的在后面）
          const timeA = a.match(/\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/)?.[1] || '';
          const timeB = b.match(/\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/)?.[1] || '';
          return timeB.localeCompare(timeA); // 降序排列
        });

      for (const backupPath of backups) {
        try {
          const result = await this.readAndVerify<T>(backupPath);
          if (result.success && result.data) {
            // 恢复备份到主文件
            await fs.copyFile(backupPath, filePath);
            this.metrics.recoveryCount++;

            return {
              success: true,
              recoveredFrom: backupPath,
              timestamp: new Date(),
              data: result.data,
            };
          }
        } catch (error) {
          // 尝试下一个备份
          Logger.debug(
            '[AtomicPersistenceService] Backup verification failed, trying next',
            error instanceof Error ? error.message : String(error),
          );
          continue;
        }
      }
    } catch (error) {
      // 无法恢复，记录错误
      Logger.debug(
        '[AtomicPersistenceService] Recovery from backup failed',
        error instanceof Error ? error.message : String(error),
      );
    }

    return {
      success: false,
      recoveredFrom: null,
      timestamp: new Date(),
      data: undefined,
    };
  }

  private async recoverFromTempFile(tempPath: string): Promise<void> {
    try {
      const content = await fs.readFile(tempPath, 'utf-8');
      const parsed = JSON.parse(content) as PersistedPayload;

      if (parsed.checksum && parsed.data) {
        const jsonData = JSON.stringify(parsed.data, null, 2);
        const actualChecksum = this.calculateChecksum(jsonData);

        if (actualChecksum === parsed.checksum) {
          // 临时文件是有效的，恢复它
          const mainPath = tempPath.slice(0, -this.tempSuffix.length);
          await fs.rename(tempPath, mainPath);
          this.metrics.recoveryCount++;
        } else {
          // 临时文件已损坏，删除
          await fs.unlink(tempPath);
        }
      } else {
        // 格式不正确，删除
        await fs.unlink(tempPath);
      }
    } catch (error) {
      // 无法恢复，删除临时文件
      Logger.debug(
        '[AtomicPersistenceService] Failed to recover from temp file',
        error instanceof Error ? error.message : String(error),
      );
      try {
        await fs.unlink(tempPath);
      } catch (unlinkError) {
        // 删除失败，记录但继续
        Logger.debug(
          '[AtomicPersistenceService] Failed to delete temp file after recovery failure',
          unlinkError instanceof Error ? unlinkError.message : String(unlinkError),
        );
      }
    }
  }
}

// 导出单例实例
export const atomicPersistence = new AtomicPersistenceService();
