import {
  CrashRecoveryService,
  createCrashRecoveryService,
} from '../../../app/main/src/persistence/crash-recovery.service';
import { AtomicPersistenceService } from '../../../app/main/src/persistence/atomic-persistence.service';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CrashRecoveryService', () => {
  let service: CrashRecoveryService;
  let atomicService: AtomicPersistenceService;
  let tempDir: string;

  beforeEach(async () => {
    atomicService = new AtomicPersistenceService();
    tempDir = join(tmpdir(), `crash-recovery-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    service = createCrashRecoveryService(tempDir);
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
      const testFile = join(tempDir, 'clarification-session.json');
      await atomicService.atomicWrite(testFile, { test: 'data' });

      const report = await service.performRecovery();

      expect(report.success).toBe(true);
      expect(report.totalFilesChecked).toBeGreaterThan(0);
      expect(report.filesRecovered).toBe(0);
    });

    it('should recover corrupted files', async () => {
      // 创建文件并备份
      const testFile = join(tempDir, 'clarification-session.json');
      await atomicService.atomicWrite(testFile, { version: 1 });
      await atomicService.atomicWrite(testFile, { version: 2 });

      // 损坏主文件
      await fs.writeFile(testFile, 'corrupted', 'utf-8');

      const report = await service.performRecovery();

      expect(report.success).toBe(true);
      expect(report.filesRecovered).toBeGreaterThan(0);
    });
  });

  describe('checkDataIntegrity', () => {
    it('should report healthy files', async () => {
      const testFile = join(tempDir, 'clarification-session.json');
      await atomicService.atomicWrite(testFile, { test: 'data' });

      const reports = await service.checkDataIntegrity();

      const report = reports.find((r) => r.filePath === testFile);
      expect(report).toBeDefined();
      expect(report?.status).toBe('healthy');
    });

    it('should report recovered files', async () => {
      const testFile = join(tempDir, 'clarification-session.json');
      await atomicService.atomicWrite(testFile, { version: 1 });
      await atomicService.atomicWrite(testFile, { version: 2 });
      await fs.writeFile(testFile, 'corrupted', 'utf-8');

      const reports = await service.checkDataIntegrity();

      const report = reports.find((r) => r.filePath === testFile);
      expect(report).toBeDefined();
      expect(report?.status).toBe('recovered');
      expect(report?.recoveredFrom).toBeDefined();
    });

    it('should report missing files', async () => {
      const reports = await service.checkDataIntegrity();

      const report = reports.find((r) => r.filePath.includes('clarification-session'));
      expect(report).toBeDefined();
      expect(report?.status).toBe('missing');
    });

    it('should count backups correctly', async () => {
      const testFile = join(tempDir, 'clarification-session.json');

      // 创建多个备份
      await atomicService.atomicWrite(testFile, { version: 1 });
      await atomicService.atomicWrite(testFile, { version: 2 });
      await atomicService.atomicWrite(testFile, { version: 3 });

      const reports = await service.checkDataIntegrity();
      const report = reports.find((r) => r.filePath === testFile);

      expect(report?.backupCount).toBe(2);
    });
  });

  describe('isDataHealthy', () => {
    it('should return true when all files are healthy', async () => {
      const testFile = join(tempDir, 'clarification-session.json');
      await atomicService.atomicWrite(testFile, { test: 'data' });

      const isHealthy = await service.isDataHealthy();

      expect(isHealthy).toBe(true);
    });

    it('should return true when files are recovered', async () => {
      const testFile = join(tempDir, 'clarification-session.json');
      await atomicService.atomicWrite(testFile, { version: 1 });
      await atomicService.atomicWrite(testFile, { version: 2 });
      await fs.writeFile(testFile, 'corrupted', 'utf-8');

      // 先执行恢复
      await service.performRecovery();

      const isHealthy = await service.isDataHealthy();

      expect(isHealthy).toBe(true);
    });

    it('should return false when files are corrupted', async () => {
      // 创建一个文件但没有备份
      const testFile = join(tempDir, 'clarification-session.json');
      await fs.writeFile(testFile, 'corrupted', 'utf-8');

      const isHealthy = await service.isDataHealthy();

      expect(isHealthy).toBe(false);
    });
  });

  describe('getRecoveryStats', () => {
    it('should report accurate statistics', async () => {
      const testFile = join(tempDir, 'clarification-session.json');

      // 创建一些备份
      await atomicService.atomicWrite(testFile, { version: 1 });
      await atomicService.atomicWrite(testFile, { version: 2 });

      const stats = await service.getRecoveryStats();

      expect(stats.totalBackups).toBeGreaterThan(0);
      expect(Array.isArray(stats.corruptedFiles)).toBe(true);
      expect(Array.isArray(stats.recoveredFiles)).toBe(true);
      expect(Array.isArray(stats.missingFiles)).toBe(true);
    });

    it('should list corrupted files', async () => {
      const testFile = join(tempDir, 'clarification-session.json');
      await fs.writeFile(testFile, 'corrupted', 'utf-8');

      const stats = await service.getRecoveryStats();

      expect(stats.corruptedFiles).toContain(testFile);
    });

    it('should list missing files', async () => {
      const stats = await service.getRecoveryStats();

      expect(stats.missingFiles.length).toBeGreaterThan(0);
    });
  });

  describe('crash scenarios', () => {
    it('should handle multiple corrupted files', async () => {
      const files = ['clarification-session.json', 'okr-document.json', 'action-log.json'];

      // 创建并损坏多个文件
      for (const file of files) {
        const filePath = join(tempDir, file);
        await atomicService.atomicWrite(filePath, { version: 1 });
        await atomicService.atomicWrite(filePath, { version: 2 });
        await fs.writeFile(filePath, 'corrupted', 'utf-8');
      }

      const report = await service.performRecovery();

      expect(report.success).toBe(true);
      expect(report.filesRecovered).toBe(files.length);
    });
  });
});
