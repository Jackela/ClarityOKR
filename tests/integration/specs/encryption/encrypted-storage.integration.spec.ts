/**
 * Integration Tests for Encrypted Storage
 * 任务20.3: 加密存储集成测试
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EncryptedStorageService } from '../../../../app/main/src/services/encrypted-storage.service.js';

describe('EncryptedStorageService Integration', () => {
  let storage: EncryptedStorageService;
  let testDataDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    testDataDir = mkdtempSync(join(tmpdir(), 'encrypted-storage-test-'));
    storage = new EncryptedStorageService(testDataDir);
  });

  afterEach(async () => {
    // Cleanup test files
    await storage.clearAll();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  describe('Encryption/Decryption', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const key = 'session-data';
      const data = {
        sessionId: 'test-session',
        intent: 'Improve productivity',
        sensitiveField: 'password123',
      };

      await storage.set(key, data);
      const retrieved = await storage.get(key);

      expect(retrieved).toEqual(data);
    });

    it('should generate different ciphertext for same plaintext', async () => {
      const key = 'test-key';
      const data = { value: 'secret' };

      await storage.set(key, data);
      const encrypted1 = await storage.getRawEncrypted(key);

      await storage.set(key, data);
      const encrypted2 = await storage.getRawEncrypted(key);

      // Same plaintext should produce different ciphertext (due to IV)
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle large data', async () => {
      const key = 'large-data';
      const largeData = {
        content: 'x'.repeat(100000), // 100KB of data (reduced from 1MB for faster tests)
        metadata: { type: 'large' },
      };

      await storage.set(key, largeData);
      const retrieved = await storage.get(key);

      expect(retrieved).toEqual(largeData);
    });

    it('should handle unicode and special characters', async () => {
      const key = 'unicode-test';
      const data = {
        chinese: '中文测试',
        arabic: 'العربية',
        emoji: '🎯🚀💯',
        special: '!@#$%^&*()\n\t\r',
      };

      await storage.set(key, data);
      const retrieved = await storage.get(key);

      expect(retrieved).toEqual(data);
    });
  });

  describe('Error Handling', () => {
    it('should return null for non-existent key', async () => {
      const result = await storage.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should throw on corrupted data', async () => {
      const key = 'corrupted';
      await storage.set(key, { data: 'test' });

      // Corrupt the file by writing invalid data
      const filePath = join(testDataDir, `${key}.json`);
      await (await import('node:fs/promises')).writeFile(filePath, 'invalid json');

      await expect(storage.get(key)).rejects.toThrow();
    });
  });
});
