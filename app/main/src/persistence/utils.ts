import { promises as fs } from 'node:fs';
import { atomicPersistence, type PersistenceResult } from './atomic-persistence.service.js';

export async function ensureDataDir(dataDir: string): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
}

/**
 * 读取JSON文件
 * 支持原子持久化格式（带校验和）
 * 自动从备份恢复
 */
export async function readJson<T>(file: string): Promise<T | null> {
  const result = await atomicPersistence.atomicRead<T>(file);

  if (result.success && result.data) {
    return result.data;
  }

  // 读取失败（包括主文件和备份都损坏）
  return null;
}

/**
 * 写入JSON文件
 * 使用原子写入模式（write-to-temp-then-rename）
 * 自动创建备份（保留最后3个）
 */
export async function writeJson<T>(file: string, value: T): Promise<PersistenceResult> {
  return atomicPersistence.atomicWrite(file, value);
}

/**
 * 清理孤立的临时文件
 * 在应用启动时调用
 */
export async function cleanupOrphanedTempFiles(dataDir: string): Promise<string[]> {
  return atomicPersistence.cleanupOrphanedTempFiles(dataDir);
}
