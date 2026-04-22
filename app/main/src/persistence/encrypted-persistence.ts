/**
 * Encrypted Persistence Utilities
 *
 * Provides encryption-at-rest for sensitive data stored in JSON files.
 * Uses AES-256-GCM encryption with keys managed by secure storage.
 */

import { promises as fs } from 'node:fs';

import {
  EncryptionError,
  type EncryptedData,
  type IEncryptionService,
} from '../core/encryption-port.js';
import { atomicPersistence, type PersistenceResult } from './atomic-persistence.service.js';

/**
 * Error thrown when encrypted persistence operations fail
 */
export class EncryptedPersistenceError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'EncryptedPersistenceError';
  }
}

/**
 * 加密数据信封格式
 * 包含加密数据和元数据
 */
interface EncryptedEnvelope {
  /** 版本号，用于未来迁移 */
  version: number;
  /** 加密的数据 */
  data: EncryptedData;
  /** 时间戳 */
  timestamp: string;
}

/**
 * 创建加密信封
 */
function createEnvelope(encryptedData: EncryptedData): EncryptedEnvelope {
  return {
    version: 1,
    data: encryptedData,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 确保数据目录存在
 */
export async function ensureDataDir(dataDir: string): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
}

/**
 * 读取并解密JSON文件
 * @param file - 文件路径
 * @param encryptionService - 加密服务实现
 * @param key - 加密密钥
 * @returns 解密后的数据，或null如果文件不存在
 * @throws EncryptedPersistenceError 如果解密失败
 */
export async function readEncryptedJson<T>(
  file: string,
  encryptionService: IEncryptionService,
  key: Buffer,
): Promise<T | null> {
  try {
    // 首先尝试原子读取
    const result = await atomicPersistence.atomicRead<EncryptedEnvelope>(file);

    if (!result.success || !result.data) {
      return null;
    }

    const envelope = result.data;

    // 验证信封格式
    if (!isValidEnvelope(envelope)) {
      // 尝试作为明文JSON读取（向后兼容）
      return await readLegacyJson<T>(file);
    }

    // 解密数据
    const decryptedJson = encryptionService.decrypt(envelope.data, key);
    return JSON.parse(decryptedJson) as T;
  } catch (error) {
    if (error instanceof EncryptedPersistenceError) {
      throw error;
    }
    if (error instanceof EncryptionError) {
      throw new EncryptedPersistenceError('Failed to decrypt data', error);
    }
    throw new EncryptedPersistenceError('Failed to read encrypted file', error);
  }
}

/**
 * 加密并写入JSON文件
 * @param file - 文件路径
 * @param value - 要加密和存储的数据
 * @param encryptionService - 加密服务实现
 * @param key - 加密密钥
 * @returns 持久化结果
 * @throws EncryptedPersistenceError 如果加密或写入失败
 */
export async function writeEncryptedJson<T>(
  file: string,
  value: T,
  encryptionService: IEncryptionService,
  key: Buffer,
): Promise<PersistenceResult> {
  try {
    // 序列化并加密数据
    const jsonData = JSON.stringify(value);
    const encryptedData = encryptionService.encrypt(jsonData, key);

    // 创建信封
    const envelope = createEnvelope(encryptedData);

    // 原子写入
    return await atomicPersistence.atomicWrite(file, envelope);
  } catch (error) {
    if (error instanceof EncryptedPersistenceError) {
      throw error;
    }
    if (error instanceof EncryptionError) {
      throw new EncryptedPersistenceError('Failed to encrypt data', error);
    }
    throw new EncryptedPersistenceError('Failed to write encrypted file', error);
  }
}

/**
 * 读取遗留的明文JSON（向后兼容）
 */
async function readLegacyJson<T>(file: string): Promise<T | null> {
  const result = await atomicPersistence.atomicRead<T>(file);
  if (result.success && result.data) {
    return result.data;
  }
  return null;
}

/**
 * 验证信封格式
 */
function isValidEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    'data' in value &&
    typeof (value as Record<string, unknown>).version === 'number' &&
    isEncryptedData((value as Record<string, unknown>).data)
  );
}

/**
 * 类型守卫：检查值是否为有效的 EncryptedData
 */
function isEncryptedData(value: unknown): value is EncryptedData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'encrypted' in value &&
    'iv' in value &&
    'authTag' in value &&
    typeof (value as Record<string, unknown>).encrypted === 'string' &&
    typeof (value as Record<string, unknown>).iv === 'string' &&
    typeof (value as Record<string, unknown>).authTag === 'string'
  );
}

/**
 * 清理孤立的临时文件
 * 在应用启动时调用
 */
export async function cleanupOrphanedTempFiles(dataDir: string): Promise<string[]> {
  return atomicPersistence.cleanupOrphanedTempFiles(dataDir);
}

/**
 * 迁移明文数据到加密格式
 * @param file - 要迁移的文件路径
 * @param encryptionService - 加密服务实现
 * @param key - 加密密钥
 * @returns true如果迁移成功
 */
export async function migrateToEncrypted<T>(
  file: string,
  encryptionService: IEncryptionService,
  key: Buffer,
): Promise<boolean> {
  try {
    const legacyData = await readLegacyJson<T>(file);
    if (legacyData === null) {
      return false;
    }

    // 重写为加密格式
    const result = await writeEncryptedJson(file, legacyData, encryptionService, key);
    return result.success;
  } catch {
    return false;
  }
}
