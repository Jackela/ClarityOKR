import { AtomicPersistenceService } from '../../../app/main/src/persistence/atomic-persistence.service';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('AtomicPersistenceService', () => {
  let service: AtomicPersistenceService;
  let tempDir: string;

  beforeEach(async () => {
    service = new AtomicPersistenceService();
    tempDir = join(tmpdir(), `atomic-persistence-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('atomicWrite', () => {
    it('should write data atomically with checksum', async () => {
      const filePath = join(tempDir, 'test.json');
      const data = { id: 'test', value: 123 };

      const result = await service.atomicWrite(filePath, data);

      expect(result.success).toBe(true);
      expect(result.backupCreated).toBe(false);
      expect(result.latencyMs).toBeGreaterThan(0);

      // 验证文件内容包含校验和
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.checksum).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.data).toEqual(data);
    });

    it('should create backup on subsequent writes', async () => {
      const filePath = join(tempDir, 'test.json');
      const data1 = { id: 'test', value: 1 };
      const data2 = { id: 'test', value: 2 };

      await service.atomicWrite(filePath, data1);
      const result = await service.atomicWrite(filePath, data2);

      expect(result.success).toBe(true);
      expect(result.backupCreated).toBe(true);

      // 验证备份存在
      const files = await fs.readdir(tempDir);
      const backups = files.filter((f: string) => f.includes('.backup.'));
      expect(backups.length).toBeGreaterThan(0);
    });

    it('should limit backup retention to 3', async () => {
      const filePath = join(tempDir, 'test.json');

      // 写入5次
      for (let i = 0; i < 5; i++) {
        await service.atomicWrite(filePath, { value: i });
      }

      // 验证只有3个备份
      const files = await fs.readdir(tempDir);
      const backups = files.filter((f: string) => f.includes('.backup.'));
      expect(backups.length).toBe(3);
    });

    it('should handle write errors gracefully', async () => {
      // 使用无效路径
      const filePath = '/invalid/path/test.json';
      const data = { test: 'data' };

      const result = await service.atomicWrite(filePath, data);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('atomicRead', () => {
    it('should read data with checksum verification', async () => {
      const filePath = join(tempDir, 'test.json');
      const data = { id: 'test', items: ['a', 'b', 'c'] };

      await service.atomicWrite(filePath, data);
      const result = await service.atomicRead(filePath);

      expect(result.success).toBe(true);
      expect(result.recoveredFrom).toBeNull();
      expect(result.data).toEqual(data);
    });

    it('should recover from backup when main file is corrupted', async () => {
      const filePath = join(tempDir, 'test.json');
      const originalData = { id: 'test', value: 'original' };
      const newData = { id: 'test', value: 'new' };

      // 写入原始数据并创建备份
      await service.atomicWrite(filePath, originalData);
      await service.atomicWrite(filePath, newData);

      // 损坏主文件
      await fs.writeFile(filePath, 'invalid json', 'utf-8');

      // 读取应该自动恢复
      const result = await service.atomicRead(filePath);

      expect(result.success).toBe(true);
      expect(result.recoveredFrom).toBeDefined();
      expect(result.data).toEqual(newData);
    });

    it('should return failure when file does not exist', async () => {
      const filePath = join(tempDir, 'non-existent.json');

      const result = await service.atomicRead(filePath);

      expect(result.success).toBe(false);
    });
  });

  describe('cleanupOrphanedTempFiles', () => {
    it('should clean up orphaned temp files', async () => {
      // 创建孤立的临时文件
      const tempFile = join(tempDir, 'orphaned.tmp');
      await fs.writeFile(tempFile, '{}', 'utf-8');

      const cleaned = await service.cleanupOrphanedTempFiles(tempDir);

      expect(cleaned.length).toBe(1);
      expect(cleaned[0]).toBe(tempFile);

      // 验证文件已删除
      try {
        await fs.access(tempFile);
        fail('File should have been deleted');
      } catch {
        // 预期的错误
      }
    });
  });

  describe('metrics', () => {
    it('should track write metrics', async () => {
      const filePath = join(tempDir, 'test.json');

      await service.atomicWrite(filePath, { value: 1 });
      await service.atomicWrite(filePath, { value: 2 });

      const metrics = service.getMetrics();

      expect(metrics.writeCount).toBe(2);
      expect(metrics.writeLatency).toBeGreaterThan(0);
      expect(metrics.backupCount).toBe(1);
    });

    it('should track read metrics', async () => {
      const filePath = join(tempDir, 'test.json');

      await service.atomicWrite(filePath, { value: 1 });
      await service.atomicRead(filePath);
      await service.atomicRead(filePath);

      const metrics = service.getMetrics();

      expect(metrics.readCount).toBe(2);
      expect(metrics.readLatency).toBeGreaterThan(0);
    });

    it('should track errors', async () => {
      // 尝试写入到无效路径
      await service.atomicWrite('/invalid/path/test.json', { value: 1 });

      const metrics = service.getMetrics();

      expect(metrics.writeErrors).toBe(1);
    });

    it('should reset metrics', async () => {
      await service.atomicWrite(join(tempDir, 'test.json'), { value: 1 });

      service.resetMetrics();
      const metrics = service.getMetrics();

      expect(metrics.writeCount).toBe(0);
      expect(metrics.writeLatency).toBe(0);
    });
  });

  describe('reliability targets', () => {
    it('should maintain data integrity after write', async () => {
      const filePath = join(tempDir, 'test.json');
      const data = {
        id: 'complex-test',
        nested: {
          array: [1, 2, 3],
          object: { a: 'b', c: 'd' },
        },
        timestamp: new Date().toISOString(),
      };

      await service.atomicWrite(filePath, data);
      const result = await service.atomicRead(filePath);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });
  });
});
