import {
  CrashRecoveryService,
  createCrashRecoveryService,
} from '@clarityokr/main/persistence/crash-recovery.service';
import { AtomicPersistenceService } from '@clarityokr/main/persistence/atomic-persistence.service';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let crashTestIndex = 0;
describe('CrashRecoveryService', () => {
  let service: CrashRecoveryService;
  let atomicService: AtomicPersistenceService;
  let tempDir: string;

  beforeEach(async () => {
    crashTestIndex += 1;
    atomicService = new AtomicPersistenceService();
    tempDir = join(tmpdir(), `crash-recovery-test-${crashTestIndex}-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    // 使用空的数据文件列表进行测试
    service = new CrashRecoveryService(tempDir, []);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('performRecovery', () => {
    it('should clean up orphaned temp files', async () => {
      // 创建孤立的临时文件
      await fs.writeFile(join(tempDir, 'test.json.tmp'), '{}', 'utf-8');

      const report = await service.performRecovery();

      expect(report.success).toBe(true);
      expect(report.tempFilesCleaned).toBe(1);
    });

    it('should detect healthy files', async () => {
      // 创建有效的数据文件
      const testFile = join(tempDir, 'test.json');
      await atomicService.atomicWrite(testFile, { test: 'data' });

      // 使用只包含该文件的服务
      const customService = new CrashRecoveryService(tempDir, ['test.json']);
      const report = await customService.performRecovery();

      expect(report.success).toBe(true);
      expect(report.totalFilesChecked).toBe(1);
      expect(report.filesRecovered).toBe(0);
    });

    it('should recover corrupted files', async () => {
      // 创建文件并备份
      const testFile = join(tempDir, 'test.json');
      await atomicService.atomicWrite(testFile, { version: 1 });
      await atomicService.atomicWrite(testFile, { version: 2 });

      // 损坏主文件
      await fs.writeFile(testFile, 'corrupted', 'utf-8');

      const customService = new CrashRecoveryService(tempDir, ['test.json']);
      const report = await customService.performRecovery();

      expect(report.success).toBe(true);
      expect(report.filesRecovered).toBe(1);
    });
  });

  describe('checkDataIntegrity', () => {
    it('should report healthy files', async () => {
      const testFile = join(tempDir, 'test.json');
      await atomicService.atomicWrite(testFile, { test: 'data' });

      const customService = new CrashRecoveryService(tempDir, ['test.json']);
      const reports = await customService.checkDataIntegrity();

      const report = reports.find((r) => r.filePath === testFile);
      expect(report).toBeDefined();
      expect(report?.status).toBe('healthy');
    });

    it('should report recovered files', async () => {
      const testFile = join(tempDir, 'test.json');
      await atomicService.atomicWrite(testFile, { version: 1 });
      await atomicService.atomicWrite(testFile, { version: 2 });
      await fs.writeFile(testFile, 'corrupted', 'utf-8');

      const customService = new CrashRecoveryService(tempDir, ['test.json']);
      const reports = await customService.checkDataIntegrity();

      const report = reports.find((r) => r.filePath === testFile);
      expect(report).toBeDefined();
      expect(report?.status).toBe('recovered');
      expect(report?.recoveredFrom).toBeDefined();
    });

    it('should report corrupted files', async () => {
      const testFile = join(tempDir, 'test.json');
      // 创建一个损坏的文件（没有备份）
      await fs.writeFile(testFile, 'corrupted', 'utf-8');

      const customService = new CrashRecoveryService(tempDir, ['test.json']);
      const reports = await customService.checkDataIntegrity();

      const report = reports.find((r) => r.filePath === testFile);
      expect(report).toBeDefined();
      expect(report?.status).toBe('corrupted');
    });

    it('should count backups correctly', async () => {
      const testFile = join(tempDir, 'test.json');

      // 创建多个备份
      await atomicService.atomicWrite(testFile, { version: 1 });
      await atomicService.atomicWrite(testFile, { version: 2 });
      await atomicService.atomicWrite(testFile, { version: 3 });

      const customService = new CrashRecoveryService(tempDir, ['test.json']);
      const reports = await customService.checkDataIntegrity();
      const report = reports.find((r) => r.filePath === testFile);

      expect(report?.backupCount).toBe(2);
    });
  });

  describe('isDataHealthy', () => {
    it('should return true when all files are healthy', async () => {
      const testFile = join(tempDir, 'test.json');
      await atomicService.atomicWrite(testFile, { test: 'data' });

      const customService = new CrashRecoveryService(tempDir, ['test.json']);
      const isHealthy = await customService.isDataHealthy();

      expect(isHealthy).toBe(true);
    });

    it('should return true when files are recovered', async () => {
      const testFile = join(tempDir, 'test.json');
      await atomicService.atomicWrite(testFile, { version: 1 });
      await atomicService.atomicWrite(testFile, { version: 2 });
      await fs.writeFile(testFile, 'corrupted', 'utf-8');

      const customService = new CrashRecoveryService(tempDir, ['test.json']);
      // 先执行恢复
      await customService.performRecovery();

      const isHealthy = await customService.isDataHealthy();

      expect(isHealthy).toBe(true);
    });

    it('should return false when files are corrupted', async () => {
      const testFile = join(tempDir, 'test.json');
      // 创建一个文件但没有备份
      await fs.writeFile(testFile, 'corrupted', 'utf-8');

      const customService = new CrashRecoveryService(tempDir, ['test.json']);
      const isHealthy = await customService.isDataHealthy();

      expect(isHealthy).toBe(false);
    });
  });

  describe('getRecoveryStats', () => {
    it('should report accurate statistics', async () => {
      const testFile = join(tempDir, 'test.json');

      // 创建一些备份
      await atomicService.atomicWrite(testFile, { version: 1 });
      await atomicService.atomicWrite(testFile, { version: 2 });

      const customService = new CrashRecoveryService(tempDir, ['test.json']);
      const stats = await customService.getRecoveryStats();

      expect(stats.totalBackups).toBeGreaterThan(0);
      expect(Array.isArray(stats.corruptedFiles)).toBe(true);
      expect(Array.isArray(stats.recoveredFiles)).toBe(true);
      expect(Array.isArray(stats.missingFiles)).toBe(true);
    });

    it('should list corrupted files', async () => {
      const testFile = join(tempDir, 'test.json');
      await fs.writeFile(testFile, 'corrupted', 'utf-8');

      const customService = new CrashRecoveryService(tempDir, ['test.json']);
      const stats = await customService.getRecoveryStats();

      expect(stats.corruptedFiles).toContain(testFile);
    });
  });

  describe('crash scenarios', () => {
    it('should handle multiple corrupted files', async () => {
      const files = ['file1.json', 'file2.json', 'file3.json'];

      // 创建并损坏多个文件
      for (const file of files) {
        const filePath = join(tempDir, file);
        await atomicService.atomicWrite(filePath, { version: 1 });
        await atomicService.atomicWrite(filePath, { version: 2 });
        await fs.writeFile(filePath, 'corrupted', 'utf-8');
      }

      const customService = new CrashRecoveryService(tempDir, files);
      const report = await customService.performRecovery();

      expect(report.success).toBe(true);
      expect(report.filesRecovered).toBe(files.length);
    });
  });
});
