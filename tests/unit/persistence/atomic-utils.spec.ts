import { promises as fs } from 'node:fs';
import { jest } from '@jest/globals';
import { join } from 'node:path';
import { AtomicPersistenceService } from '@clarityokr/main/persistence/atomic-persistence.service';
import { BackupStrategy } from '@clarityokr/main/persistence/backup-strategy';
import {
  calculateChecksum,
  createBackup,
  rotateBackups,
  verifyFile,
  readAndVerify,
  recoverFromBackup,
  recoverFromTempFile,
} from '@clarityokr/main/persistence/atomic-persistence.utils';

describe('Actual atomic recovery integrity and ordering', () => {
  let directory: string;
  const envelope = (data: unknown) =>
    JSON.stringify({ data, checksum: calculateChecksum(JSON.stringify(data, null, 2)) });
  beforeEach(async () => {
    const parent = join(process.cwd(), 'tmp');
    await fs.mkdir(parent, { recursive: true });
    directory = await fs.mkdtemp(join(parent, 'atomic-recovery-'));
  });
  afterEach(async () => {
    jest.useRealTimers();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('preserves separate rapid revisions when multiple writers share one clock tick', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-09T00:00:00Z') });
    const file = join(directory, 'record.json');
    const backups: string[] = [];
    for (let revision = 1; revision <= 3; revision++) {
      await fs.writeFile(file, envelope({ revision }));
      backups.push(await createBackup(file, '.backup'));
    }
    expect(new Set(backups).size).toBe(3);
    for (let index = 0; index < 3; index++) {
      expect((await readAndVerify(backups[index])).data).toEqual({ revision: index + 1 });
    }
  });

  it('recovers an actual service from an intact older backup when the newest backup is corrupt', async () => {
    const file = join(directory, 'session[1].json');
    await fs.writeFile(file, '{crashed');
    await fs.writeFile(
      join(directory, 'session[1].backup.2024-01-01T00-00-00-000Z.json'),
      envelope({ revision: 1 }),
    );
    const newest = join(directory, 'session[1].backup.2024-02-01T00-00-00-000Z.json');
    await fs.writeFile(newest, '{corrupt');
    await fs.writeFile(
      join(directory, 'session1.backup.2024-01-01T00-00-00-000Z.json'),
      envelope({ unrelated: true }),
    );
    const strategy = new BackupStrategy();
    expect(await strategy.getLatestBackup(directory, 'session[1]')).toBe(newest);
    const service = new AtomicPersistenceService();
    const recovered = await service.atomicRead(file);
    expect(recovered.success).toBe(true);
    expect(recovered.data).toEqual({ revision: 1 });
    expect(service.getMetrics().recoveryCount).toBe(1);
  });

  it('restores the newest intact backup instead of an older valid snapshot', async () => {
    const file = join(directory, 'session.json');
    await fs.writeFile(
      join(directory, 'session.backup.2024-01-01T00-00-00-000Z.json'),
      envelope({ revision: 1 }),
    );
    await fs.writeFile(
      join(directory, 'session.backup.2024-02-01T00-00-00-000Z.json'),
      envelope({ revision: 2 }),
    );
    await fs.writeFile(join(directory, 'session.backup.2024-03-01T00-00-00-000Z.json'), '{corrupt');
    const recovered = await recoverFromBackup<{ revision: number }>(file, '.backup');
    expect(recovered.success).toBe(true);
    expect(recovered.data).toEqual({ revision: 2 });
    expect(recovered.recoveredFrom).toContain('2024-02-01');
    expect(await readAndVerify(file)).toEqual({ success: true, data: { revision: 2 } });
  });

  it('treats punctuation in a document filename literally during recovery and rotation', async () => {
    const file = join(directory, 'session[1].json');
    await fs.writeFile(
      join(directory, 'session[1].backup.2024-01-01T00-00-00-000Z.json'),
      envelope({ revision: 1 }),
    );
    await fs.writeFile(
      join(directory, 'session[1].backup.2024-02-01T00-00-00-000Z.json'),
      envelope({ revision: 2 }),
    );
    const unrelated = join(directory, 'session1.backup.2024-01-01T00-00-00-000Z.json');
    await fs.writeFile(unrelated, envelope({ unrelated: true }));
    await rotateBackups(directory, 'session[1]', '.backup', 1);
    expect(await fs.readdir(directory)).toContain('session1.backup.2024-01-01T00-00-00-000Z.json');
    expect((await recoverFromBackup(file, '.backup')).data).toEqual({ revision: 2 });
  });

  it('requires both the persisted checksum and expected checksum to match the data', async () => {
    const file = join(directory, 'integrity.json');
    const data = { selectedOption: 'a' };
    const checksum = calculateChecksum(JSON.stringify(data, null, 2));
    await fs.writeFile(file, envelope(data));
    expect(await verifyFile(file, checksum)).toBe(true);
    expect(await verifyFile(file, 'different')).toBe(false);
    await fs.writeFile(file, JSON.stringify({ data, checksum: 'tampered' }));
    expect(await verifyFile(file, checksum)).toBe(false);
    expect(await readAndVerify(file)).toEqual({ success: false, checksumFailures: 1 });
    await fs.writeFile(file, '{}');
    expect(await verifyFile(file, checksum)).toBe(false);
    expect(await readAndVerify(file)).toEqual({ success: false, checksumFailures: 1 });
    await fs.writeFile(file, '{invalid');
    expect(await verifyFile(file, checksum)).toBe(false);
    expect(await readAndVerify(file)).toEqual({ success: false });
    expect(await readAndVerify(join(directory, 'absent'))).toEqual({ success: false });
  });

  it('preserves exact data when copying backups and safely handles absent backup directories', async () => {
    const file = join(directory, 'record.json');
    await fs.writeFile(file, envelope({ revision: 1 }));
    const backup = await createBackup(file, '.backup');
    expect(await fs.readFile(backup, 'utf8')).toBe(await fs.readFile(file, 'utf8'));
    await rotateBackups(directory, 'record', '.backup', 0);
    expect(await fs.readdir(directory)).toEqual(['record.json']);
    expect(
      (await recoverFromBackup(join(directory, 'missing', 'record.json'), '.backup')).success,
    ).toBe(false);
    await expect(
      rotateBackups(join(directory, 'missing'), 'record', '.backup', 1),
    ).resolves.toBeUndefined();
  });

  it('commits only a complete verified temp file and deletes corrupt or incomplete temps', async () => {
    const file = join(directory, 'record.json');
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, envelope({ revision: 2 }));
    await recoverFromTempFile(temp, '.tmp');
    expect(await readAndVerify(file)).toEqual({ success: true, data: { revision: 2 } });
    for (const content of ['{invalid', '{}', '{"data":{},"checksum":"wrong"}']) {
      await fs.writeFile(temp, content);
      await recoverFromTempFile(temp, '.tmp');
      await expect(fs.access(temp)).rejects.toThrow();
      expect((await readAndVerify(file)).data).toEqual({ revision: 2 });
    }
    await expect(recoverFromTempFile(temp, '.tmp')).resolves.toBeUndefined();
  });
});
