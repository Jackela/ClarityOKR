import { promises as fs } from 'node:fs';
import { dirname, basename, extname, join } from 'node:path';

import { Logger } from '../core/logger.js';

/**
 * Backup rotation configuration
 */
export interface BackupConfig {
  retentionCount: number;
  backupSuffix: string;
}

/**
 * Default backup configuration - keeps 3 backup versions
 */
const DEFAULT_CONFIG: BackupConfig = {
  retentionCount: 3,
  backupSuffix: '.backup',
};

/**
 * Backup rotation result
 */
export interface BackupResult {
  backupPath: string | null;
  rotatedCount: number;
}

/**
 * Backup strategy for file-based persistence.
 * Handles creating backups and rotating old versions.
 */
export class BackupStrategy {
  private readonly config: BackupConfig;

  constructor(config: Partial<BackupConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a backup of the given file and rotate old backups.
   * @param filePath - Path to the file to backup
   * @returns Backup result with path and rotation count
   */
  async createBackup(filePath: string): Promise<BackupResult> {
    const baseName = basename(filePath, extname(filePath));
    const dir = dirname(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(dir, `${baseName}${this.config.backupSuffix}.${timestamp}.json`);

    await fs.copyFile(filePath, backupPath);
    const rotatedCount = await this.rotateBackups(dir, baseName);

    Logger.debug('[BackupStrategy] Created backup:', backupPath);

    return { backupPath, rotatedCount };
  }

  /**
   * Find all backup files for a given base name.
   * @param dir - Directory containing backups
   * @param baseName - Base name of the file (without extension)
   * @returns Array of backup file paths sorted by age (oldest first)
   */
  async findBackups(dir: string, baseName: string): Promise<string[]> {
    const pattern = new RegExp(`^${baseName}\\${this.config.backupSuffix}\\.[^\\.]+\\.json$`);

    try {
      const entries = await fs.readdir(dir);
      const backups = entries
        .filter((name: string) => pattern.test(name))
        .map((name: string) => join(dir, name))
        .sort((a, b) => {
          const timeA = a.match(/\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/)?.[1] || '';
          const timeB = b.match(/\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/)?.[1] || '';
          return timeA.localeCompare(timeB);
        });

      return backups;
    } catch (error) {
      Logger.debug(
        '[BackupStrategy] Failed to find backups:',
        error instanceof Error ? error.message : String(error),
      );
      return [];
    }
  }

  /**
   * Get the latest backup for a file.
   * @param dir - Directory containing backups
   * @param baseName - Base name of the file
   * @returns Path to the latest backup or null if none exist
   */
  async getLatestBackup(dir: string, baseName: string): Promise<string | null> {
    const backups = await this.findBackups(dir, baseName);

    if (backups.length === 0) {
      return null;
    }

    // Return the most recent one (last in sorted array)
    return backups[backups.length - 1];
  }

  /**
   * Rotate backups, keeping only the most recent N versions.
   * @param dir - Directory containing backups
   * @param baseName - Base name of the file
   * @returns Number of backups rotated/deleted
   */
  async rotateBackups(dir: string, baseName: string): Promise<number> {
    const backups = await this.findBackups(dir, baseName);
    let rotatedCount = 0;

    while (backups.length > this.config.retentionCount) {
      const oldBackup = backups.shift();
      if (oldBackup) {
        try {
          await fs.unlink(oldBackup);
          rotatedCount++;
          Logger.debug('[BackupStrategy] Rotated backup:', oldBackup);
        } catch (error) {
          Logger.debug(
            '[BackupStrategy] Failed to delete old backup:',
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }

    return rotatedCount;
  }

  /**
   * Get the backup pattern for a file.
   * @param filePath - Original file path
   * @returns Object with baseName and dir components
   */
  parseFilePath(filePath: string): { baseName: string; dir: string } {
    return {
      baseName: basename(filePath, extname(filePath)),
      dir: dirname(filePath),
    };
  }
}
