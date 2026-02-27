import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ensureDataDir, readJson, writeJson } from '../../../app/main/src/persistence/utils';

const TEST_DIR = join(process.cwd(), 'data-test-utils');

describe('persistence utils', () => {
  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('ensureDataDir creates directory if not exists', async () => {
    await ensureDataDir(TEST_DIR);
    const stat = await fs.stat(TEST_DIR);
    expect(stat.isDirectory()).toBe(true);
  });

  it('readJson returns null for non-existent file', async () => {
    const result = await readJson<{ foo: string }>(join(TEST_DIR, 'missing.json'));
    expect(result).toBeNull();
  });

  it('writeJson and readJson round-trip correctly', async () => {
    await ensureDataDir(TEST_DIR);
    const filePath = join(TEST_DIR, 'test.json');
    const data = { name: 'test', count: 42 };
    await writeJson(filePath, data);
    const result = await readJson<typeof data>(filePath);
    expect(result).toEqual(data);
  });

  it('readJson returns null for empty file', async () => {
    await ensureDataDir(TEST_DIR);
    const filePath = join(TEST_DIR, 'empty.json');
    await fs.writeFile(filePath, '', 'utf-8');
    const result = await readJson<{ foo: string }>(filePath);
    expect(result).toBeNull();
  });

  it('readJson returns null for invalid JSON', async () => {
    await ensureDataDir(TEST_DIR);
    const filePath = join(TEST_DIR, 'invalid.json');
    await fs.writeFile(filePath, 'not valid json', 'utf-8');
    const result = await readJson<{ foo: string }>(filePath);
    expect(result).toBeNull();
  });
});
