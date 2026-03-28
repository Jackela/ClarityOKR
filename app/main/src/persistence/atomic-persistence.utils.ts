import { createHash } from 'node:crypto';
import { basename, dirname, extname, join } from 'node:path';
import { promises as fs } from 'node:fs';

import { Logger } from '../core/logger.js';
import type { PersistedPayload, RecoveryResult } from './atomic-persistence.types.js';

/**
 * Calculate SHA256 checksum
 */
export function calculateChecksum(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Create backup file
 */
export async function createBackup(filePath: string, backupSuffix: string): Promise<string> {
  const baseName = basename(filePath, extname(filePath));
  const dir = dirname(filePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(dir, `${baseName}${backupSuffix}.${timestamp}.json`);

  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

/**
 * Rotate old backups, keeping only the most recent ones
 */
export async function rotateBackups(
  dir: string,
  baseName: string,
  backupSuffix: string,
  retentionCount: number,
): Promise<void> {
  const pattern = new RegExp(`^${baseName}\\${backupSuffix}\\.[^\\.]+\\.json$`);

  try {
    const entries = await fs.readdir(dir);
    const backups = entries
      .filter((name: string) => pattern.test(name))
      .map((name: string) => join(dir, name))
      .sort((a, b) => {
        const timeA = a.match(/\\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/)?.[1] || '';
        const timeB = b.match(/\\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/)?.[1] || '';
        return timeA.localeCompare(timeB);
      });

    while (backups.length > retentionCount) {
      const oldBackup = backups.shift();
      if (oldBackup) {
        try {
          await fs.unlink(oldBackup);
        } catch (error) {
          Logger.debug(
            '[AtomicPersistenceService] Failed to delete old backup',
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
  } catch (error) {
    Logger.debug(
      '[AtomicPersistenceService] Backup rotation error',
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Verify file checksum
 */
export async function verifyFile(filePath: string, expectedChecksum: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as PersistedPayload;

    if (!parsed.checksum || !parsed.data) {
      return false;
    }

    const jsonData = JSON.stringify(parsed.data, null, 2);
    const actualChecksum = calculateChecksum(jsonData);

    return actualChecksum === expectedChecksum;
  } catch (error) {
    Logger.debug(
      '[AtomicPersistenceService] File verification failed',
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

/**
 * Read and verify file
 */
export async function readAndVerify<T>(
  filePath: string,
): Promise<{ success: boolean; data?: T; checksumFailures?: number }> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as PersistedPayload<T>;

    if (!parsed.checksum || !parsed.data) {
      return { success: false, checksumFailures: 1 };
    }

    const jsonData = JSON.stringify(parsed.data, null, 2);
    const actualChecksum = calculateChecksum(jsonData);

    if (actualChecksum !== parsed.checksum) {
      return { success: false, checksumFailures: 1 };
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

/**
 * Recover from backup
 */
export async function recoverFromBackup<T>(
  filePath: string,
  backupSuffix: string,
): Promise<RecoveryResult<T>> {
  const baseName = basename(filePath, extname(filePath));
  const dir = dirname(filePath);
  const pattern = new RegExp(`^${baseName}\\${backupSuffix}\\.[^\\.]+\\.json$`);

  try {
    const entries = await fs.readdir(dir);
    const backups = entries
      .filter((name: string) => pattern.test(name))
      .map((name: string) => join(dir, name))
      .sort((a, b) => {
        const timeA = a.match(/\\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/)?.[1] || '';
        const timeB = b.match(/\\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/)?.[1] || '';
        return timeB.localeCompare(timeA);
      });

    for (const backupPath of backups) {
      try {
        const result = await readAndVerify<T>(backupPath);
        if (result.success && result.data) {
          await fs.copyFile(backupPath, filePath);

          return {
            success: true,
            recoveredFrom: backupPath,
            timestamp: new Date(),
            data: result.data,
          };
        }
      } catch (error) {
        Logger.debug(
          '[AtomicPersistenceService] Backup verification failed, trying next',
          error instanceof Error ? error.message : String(error),
        );
        continue;
      }
    }
  } catch (error) {
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

/**
 * Recover from temp file
 */
export async function recoverFromTempFile(tempPath: string, tempSuffix: string): Promise<void> {
  const { calculateChecksum } = await import('./atomic-persistence.utils.js');

  try {
    const content = await fs.readFile(tempPath, 'utf-8');
    const parsed = JSON.parse(content) as PersistedPayload;

    if (parsed.checksum && parsed.data) {
      const jsonData = JSON.stringify(parsed.data, null, 2);
      const actualChecksum = calculateChecksum(jsonData);

      if (actualChecksum === parsed.checksum) {
        const mainPath = tempPath.slice(0, -tempSuffix.length);
        await fs.rename(tempPath, mainPath);
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
    } catch {
      // Ignore
    }
  }
}
