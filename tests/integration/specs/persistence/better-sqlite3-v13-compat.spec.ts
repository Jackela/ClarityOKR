import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { ConnectionManager } from '../../../../app/main/src/persistence/connection-manager.js';
import {
  LATEST_SCHEMA_VERSION,
  OkrStore,
  getSchemaVersion,
} from '../../../../app/main/src/persistence/okr-store/index.js';

const require = createRequire(import.meta.url);
const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/better-sqlite3-v12',
);
const fixtureDb = join(fixtureDir, 'clarityokr-from-12.11.1.db');
const manifest = JSON.parse(readFileSync(join(fixtureDir, 'manifest.json'), 'utf8')) as {
  objectiveId: string;
  krAId: string;
  krBId: string;
  title: string;
  period: string;
  schemaVersion: number;
  keyResults: Array<{
    id: string;
    statement: string;
    successMetric: string | null;
    progress: number | null;
    status: string;
  }>;
};

describe('better-sqlite3 13 compatibility with a 12.11.1 fixture', () => {
  let dir: string;
  let dbPath: string;
  let manager: ConnectionManager;
  let store: OkrStore;
  let clock: number;

  beforeEach(() => {
    expect(require('better-sqlite3/package.json').version).toMatch(/^13\./);
    dir = mkdtempSync(join(tmpdir(), 'bs3-v13-compat-'));
    dbPath = join(dir, 'clarityokr.db');
    copyFileSync(fixtureDb, dbPath);
    manager = new ConnectionManager({ dbPath });
    manager.initialize();
    clock = Date.UTC(2026, 10, 21, 0, 0, 0);
    store = new OkrStore(manager.getDb(), () => new Date((clock += 1000)));
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('opens the v12 file, keeps the schema, and reads the rows written by 12.11.1', () => {
    expect(getSchemaVersion(manager.getDb())).toBe(LATEST_SCHEMA_VERSION);
    expect(getSchemaVersion(manager.getDb())).toBe(manifest.schemaVersion);

    const okr = store.getObjective(manifest.objectiveId);
    expect(okr).not.toBeNull();
    expect(okr?.title).toBe(manifest.title);
    expect(okr?.period).toBe(manifest.period);
    expect(
      okr?.keyResults.map((kr) => ({
        id: kr.id,
        statement: kr.statement,
        progress: kr.progress,
        status: kr.status,
      })),
    ).toEqual(
      manifest.keyResults.map((kr) => ({
        id: kr.id,
        statement: kr.statement,
        progress: kr.progress,
        status: kr.status,
      })),
    );
    expect(store.listProgressEntries(manifest.krAId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'set', value: 40, status: 'in_progress' }),
      ]),
    );
    expect(store.getObjective(manifest.krBId)).toBeNull();
    expect(
      store.getObjective(manifest.objectiveId)?.keyResults.find((kr) => kr.id === manifest.krBId),
    ).toMatchObject({
      statement: 'Existing KR B',
      progress: null,
      status: 'not_started',
    });
  });

  it('writes new rows and still sees the old and new data after reopening', () => {
    store.setProgress(manifest.krBId, { value: 75, status: 'at_risk' });
    const created = store.createObjective({
      id: '44444444-4444-4444-8444-444444444444',
      title: 'Written under better-sqlite3 13',
      period: '2026-Q4',
      keyResults: [{ id: '55555555-5555-4555-8555-555555555555', statement: 'New KR under 13' }],
    });

    manager.close();

    const reopened = new ConnectionManager({ dbPath });
    reopened.initialize();
    try {
      const again = new OkrStore(reopened.getDb());
      const original = again.getObjective(manifest.objectiveId);
      expect(original?.title).toBe(manifest.title);
      expect(original?.keyResults.find((kr) => kr.id === manifest.krAId)).toMatchObject({
        progress: 40,
        status: 'in_progress',
      });
      expect(original?.keyResults.find((kr) => kr.id === manifest.krBId)).toMatchObject({
        progress: 75,
        status: 'at_risk',
      });
      expect(again.getObjective(created.id)).toMatchObject({
        title: 'Written under better-sqlite3 13',
        period: '2026-Q4',
      });
      expect(again.listProgressEntries(manifest.krBId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'set', value: 75, status: 'at_risk' }),
        ]),
      );
    } finally {
      reopened.close();
    }
  });
});
