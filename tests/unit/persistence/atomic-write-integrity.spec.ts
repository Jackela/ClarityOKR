import { jest } from '@jest/globals';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { AtomicPersistenceService } from '@clarityokr/main/persistence/index';
import {
  calculateChecksum,
  readAndVerify,
  verifyFile,
  recoverFromTempFile,
  recoverFromBackup,
} from '@clarityokr/main/persistence/atomic-persistence.utils';

const envelope = (data: unknown) =>
  JSON.stringify({ data, checksum: calculateChecksum(JSON.stringify(data, null, 2)) });
describe('Actual atomic persistence failure integrity and falsy payloads', () => {
  let directory: string;
  let service: AtomicPersistenceService;
  beforeEach(async () => {
    directory = await fs.mkdtemp(join(process.cwd(), 'atomic-fixture-'));
    service = new AtomicPersistenceService();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each([0, false, '', null])(
    'round-trips the valid JSON payload %p through writes and recovery',
    async (data) => {
      const file = join(directory, 'data.json');
      expect((await service.atomicWrite(file, data)).success).toBe(true);
      expect((await service.atomicRead(file)).data).toEqual(data);
      const checksum = calculateChecksum(JSON.stringify(data, null, 2));
      expect(await verifyFile(file, checksum)).toBe(true);
      expect((await readAndVerify(file)).data).toEqual(data);
      const temp = join(directory, 'recovered.json.tmp');
      await fs.writeFile(temp, envelope(data));
      await recoverFromTempFile(temp, '.tmp');
      expect((await readAndVerify(join(directory, 'recovered.json'))).data).toEqual(data);
      await fs.writeFile(
        join(directory, 'backup.backup.2026-01-01T00-00-00-000Z.json'),
        envelope(data),
      );
      expect((await recoverFromBackup(join(directory, 'backup.json'), '.backup')).data).toEqual(
        data,
      );
    },
  );

  it('refuses to overwrite the existing document if its required backup cannot be created', async () => {
    const file = join(directory, 'protected.json');
    await service.atomicWrite(file, { revision: 1 });
    const original = await fs.readFile(file, 'utf8');
    const copy = fs.copyFile.bind(fs);
    jest.spyOn(fs, 'copyFile').mockImplementation(async (source, target, mode) => {
      if (source === file)
        throw Object.assign(new Error('backup write denied'), { code: 'EACCES' });
      return copy(source, target, mode);
    });
    const failed = await service.atomicWrite(file, { revision: 2 });
    expect(failed.success).toBe(false);
    expect(failed.error?.message).toBe('backup write denied');
    expect(await fs.readFile(file, 'utf8')).toBe(original);
    expect(service.getMetrics().writeErrors).toBe(1);
  });

  it('does not replace a committed document with circular or undefined data', async () => {
    const file = join(directory, 'protected.json');
    await service.atomicWrite(file, { revision: 1 });
    const data: { self?: unknown } = {};
    data.self = data;
    expect((await service.atomicWrite(file, data)).success).toBe(false);
    expect((await service.atomicWrite(file, undefined)).success).toBe(false);
    expect((await service.atomicRead(file)).data).toEqual({ revision: 1 });
    expect((await fs.readdir(directory)).some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  it('cleans corrupt and incomplete orphan temp files while recovering an intact one', async () => {
    const good = join(directory, 'good.json.tmp');
    const bad = join(directory, 'bad.json.tmp');
    const missing = join(directory, 'missing.json.tmp');
    await fs.writeFile(good, envelope({ revision: 1 }));
    await fs.writeFile(bad, '{invalid');
    await fs.writeFile(missing, '{}');
    await fs.mkdir(join(directory, 'directory.tmp'));
    expect(await service.cleanupOrphanedTempFiles(directory)).toEqual(
      expect.arrayContaining([good, bad, missing]),
    );
    expect((await service.atomicRead(join(directory, 'good.json'))).data).toEqual({ revision: 1 });
    expect(await fs.readdir(directory)).toEqual(
      expect.arrayContaining(['directory.tmp', 'good.json']),
    );
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.json.tmp'))).toHaveLength(
      0,
    );
    expect(await service.cleanupOrphanedTempFiles(join(directory, 'absent'))).toEqual([]);
    service.resetMetrics();
    expect(service.getMetrics().recoveryCount).toBe(0);
  });
});
