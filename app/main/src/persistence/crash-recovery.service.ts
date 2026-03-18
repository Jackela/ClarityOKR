import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { atomicPersistence, type RecoveryResult } from './atomic-persistence.service.js';

export interface CrashRecoveryReport {
  tempFilesCleaned: number;
  filesRecovered: number;
  totalFilesChecked: number;
  timestamp: Date;
  success: boolean;
}

export interface DataIntegrityReport {
  filePath: string;
  status: 'healthy' | 'recovered' | 'corrupted' | 'missing';
  recoveredFrom?: string;
  backupCount: number;
}

/**
 * 崩溃恢复服务
 * 在应用启动时执行，确保数据完整性
 * 检测并恢复因崩溃而中断的写入操作
 */
export class CrashRecoveryService {
  private readonly dataDir: string;
  private readonly dataFiles: string[];

  constructor(dataDir: string, dataFiles?: string[]) {
    this.dataDir = dataDir;
    // 默认数据文件列表
    this.dataFiles = dataFiles ?? [
      'clarification-session.json',
      'okr-document.json',
      'action-log.json',
      'multi-sessions.json',
    ];
  }

  /**
   * 执行完整的崩溃恢复流程
   * 1. 清理孤立的临时文件
   * 2. 检查数据文件完整性
   * 3. 如有必要，从备份恢复
   */
  async performRecovery(): Promise<CrashRecoveryReport> {
    const timestamp = new Date();
    let tempFilesCleaned = 0;
    let filesRecovered = 0;
    let totalFilesChecked = 0;

    try {
      // 1. 清理孤立的临时文件
      const cleanedFiles = await atomicPersistence.cleanupOrphanedTempFiles(this.dataDir);
      tempFilesCleaned = cleanedFiles.length;

      // 2. 检查数据文件完整性
      const integrityResults = await this.checkDataIntegrity();
      totalFilesChecked = integrityResults.length;

      // 3. 统计恢复的文件
      filesRecovered = integrityResults.filter(
        (r) => r.status === 'recovered' || r.status === 'corrupted',
      ).length;

      return {
        tempFilesCleaned,
        filesRecovered,
        totalFilesChecked,
        timestamp,
        success: true,
      };
    } catch (error) {
      console.error('Crash recovery failed:', error);
      return {
        tempFilesCleaned,
        filesRecovered,
        totalFilesChecked,
        timestamp,
        success: false,
      };
    }
  }

  /**
   * 检查数据文件完整性
   * 检查所有关键数据文件，并在必要时从备份恢复
   */
  async checkDataIntegrity(): Promise<DataIntegrityReport[]> {
    const reports: DataIntegrityReport[] = [];

    for (const fileName of this.dataFiles) {
      const filePath = join(this.dataDir, fileName);
      const report = await this.checkSingleFile(filePath);
      reports.push(report);
    }

    return reports;
  }

  /**
   * 检查单个文件的完整性
   */
  private async checkSingleFile(filePath: string): Promise<DataIntegrityReport> {
    const backupCount = await this.countBackups(filePath);

    try {
      // 尝试读取并验证文件
      const result = await atomicPersistence.atomicRead<unknown>(filePath);

      if (result.success) {
        if (result.recoveredFrom) {
          // 文件从备份恢复
          return {
            filePath,
            status: 'recovered',
            recoveredFrom: result.recoveredFrom,
            backupCount,
          };
        }

        // 文件健康
        return {
          filePath,
          status: 'healthy',
          backupCount,
        };
      }

      // 文件损坏且无法从备份恢复
      return {
        filePath,
        status: 'corrupted',
        backupCount,
      };
    } catch (error) {
      // 文件不存在
      return {
        filePath,
        status: 'missing',
        backupCount,
      };
    }
  }

  /**
   * 计算文件的备份数量
   */
  private async countBackups(filePath: string): Promise<number> {
    const baseName = filePath.split('/').pop()?.replace('.json', '') ?? '';
    const backupPattern = new RegExp(`^${baseName}\\.backup\\.`);

    try {
      const entries = await fs.readdir(this.dataDir);
      return entries.filter((name) => backupPattern.test(name)).length;
    } catch {
      return 0;
    }
  }

  /**
   * 验证是否所有数据文件都是健康的
   */
  async isDataHealthy(): Promise<boolean> {
    const reports = await this.checkDataIntegrity();
    return reports.every((r) => r.status === 'healthy' || r.status === 'recovered');
  }

  /**
   * 获取恢复统计数据
   */
  async getRecoveryStats(): Promise<{
    totalBackups: number;
    corruptedFiles: string[];
    recoveredFiles: string[];
    missingFiles: string[];
  }> {
    const reports = await this.checkDataIntegrity();

    return {
      totalBackups: reports.reduce((sum, r) => sum + r.backupCount, 0),
      corruptedFiles: reports.filter((r) => r.status === 'corrupted').map((r) => r.filePath),
      recoveredFiles: reports.filter((r) => r.status === 'recovered').map((r) => r.filePath),
      missingFiles: reports.filter((r) => r.status === 'missing').map((r) => r.filePath),
    };
  }
}

// 导出单例实例
export function createCrashRecoveryService(dataDir: string): CrashRecoveryService {
  return new CrashRecoveryService(dataDir);
}
