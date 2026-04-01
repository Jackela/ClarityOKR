/**
 * Encrypted Storage Service
 *
 * Provides generic encrypted key-value storage for sensitive data.
 * Uses AES-256-GCM encryption with keys managed by MasterKeyManager.
 *
 * @module services/encrypted-storage
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { existsSync, mkdirSync, promises as fs } from 'node:fs';
import { join } from 'node:path';

import { Logger } from '../core/logger.js';
import { FallbackKeyProvider } from './secure-storage/fallback-key-provider.js';
import { MasterKeyManager } from './secure-storage/master-key-manager.js';

interface EncryptedData {
  iv: string;
  authTag: string;
  encrypted: string;
  timestamp: number;
}

/**
 * Service for storing data with encryption at rest.
 * Uses AES-256-GCM for authenticated encryption.
 */
export class EncryptedStorageService {
  private readonly dataDir: string;
  private readonly keyManager: MasterKeyManager;

  constructor(dataDir: string) {
    this.dataDir = dataDir;

    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const fallbackProvider = new FallbackKeyProvider();
    this.keyManager = new MasterKeyManager(fallbackProvider);
  }

  /**
   * Store data encrypted under the given key.
   */
  async set(key: string, data: unknown): Promise<void> {
    try {
      const encryptionKey = this.keyManager.getOrCreateKey();
      const iv = randomBytes(16);
      const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);

      const plaintext = JSON.stringify(data);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();

      const encryptedData: EncryptedData = {
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        encrypted: encrypted.toString('base64'),
        timestamp: Date.now(),
      };

      const filePath = this.getFilePath(key);
      await fs.writeFile(filePath, JSON.stringify(encryptedData), 'utf8');

      Logger.debug(`[EncryptedStorage] Stored encrypted data for key: ${key}`);
    } catch (error) {
      Logger.error(`[EncryptedStorage] Failed to store data for key ${key}:`, error);
      throw new Error(
        `Failed to store encrypted data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Retrieve and decrypt data by key.
   */
  async get(key: string): Promise<unknown | null> {
    try {
      const filePath = this.getFilePath(key);

      if (!existsSync(filePath)) {
        return null;
      }

      const content = await fs.readFile(filePath, 'utf8');
      const encryptedData: EncryptedData = JSON.parse(content);

      const encryptionKey = this.keyManager.getOrCreateKey();
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const authTag = Buffer.from(encryptedData.authTag, 'base64');
      const encrypted = Buffer.from(encryptedData.encrypted, 'base64');

      const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      Logger.error(`[EncryptedStorage] Failed to retrieve data for key ${key}:`, error);
      throw new Error(
        `Failed to retrieve encrypted data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get the raw encrypted data without decryption.
   * Used for testing that encryption produces different ciphertexts.
   */
  async getRawEncrypted(key: string): Promise<string | null> {
    try {
      const filePath = this.getFilePath(key);

      if (!existsSync(filePath)) {
        return null;
      }

      const content = await fs.readFile(filePath, 'utf8');
      const encryptedData: EncryptedData = JSON.parse(content);

      return encryptedData.encrypted;
    } catch (error) {
      Logger.error(`[EncryptedStorage] Failed to get raw encrypted data for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Clear all stored data.
   */
  async clearAll(): Promise<void> {
    try {
      if (existsSync(this.dataDir)) {
        const files = await fs.readdir(this.dataDir);
        await Promise.all(files.map((file) => fs.unlink(join(this.dataDir, file))));
      }
      Logger.debug('[EncryptedStorage] Cleared all stored data');
    } catch (error) {
      Logger.error('[EncryptedStorage] Failed to clear all data:', error);
      throw new Error(
        `Failed to clear encrypted storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get the file path for a key.
   */
  private getFilePath(key: string): string {
    // Sanitize key for use as filename
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.dataDir, `${sanitizedKey}.json`);
  }
}
