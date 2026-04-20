import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OkrRepository } from '../../../../app/main/src/persistence/okr-repository.js';
import { DatabaseService } from '../../../../app/main/src/persistence/database.service.js';
import type { OKRDocument } from '../../../../packages/contracts/src/clarify-to-okr.contract';

describe('OkrRepository Integration', () => {
  let testDir: string;
  let db: DatabaseService;
  let repo: OkrRepository;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'clarityokr-okr-test-'));
    db = new DatabaseService({ dataDir: testDir, filename: 'test.db' });
    db.initialize();
    repo = new OkrRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('saves and loads OKR document', async () => {
    const document: OKRDocument = {
      id: 'okr-1',
      objective: 'Increase team productivity by 25%',
      keyResults: [
        { id: 'kr-1', statement: 'Implement automated testing', successMetric: '80% coverage' },
        { id: 'kr-2', statement: 'Reduce meeting time', successMetric: '50% reduction' },
      ],
      sourceSessionId: 'session-1',
      generatedAt: new Date().toISOString(),
      lastEditedAt: null,
      regenerationPolicy: 'overwrite',
      manualEdits: [],
    };

    await repo.save(document);
    const loaded = await repo.loadLatest();

    expect(loaded).toEqual(document);
    expect(loaded?.objective).toBe('Increase team productivity by 25%');
    expect(loaded?.keyResults.length).toBe(2);
  });

  it('returns null when no OKR document exists', async () => {
    const loaded = await repo.loadLatest();

    expect(loaded).toBeNull();
  });

  it('overwrites existing OKR document', async () => {
    const now = Date.now();
    const document1: OKRDocument = {
      id: 'okr-1',
      objective: 'First objective',
      keyResults: [],
      sourceSessionId: 'session-1',
      generatedAt: new Date(now).toISOString(),
      lastEditedAt: null,
      regenerationPolicy: 'overwrite',
      manualEdits: [],
    };

    const document2: OKRDocument = {
      id: 'okr-2',
      objective: 'Second objective',
      keyResults: [],
      sourceSessionId: 'session-1',
      generatedAt: new Date(now + 1000).toISOString(),
      lastEditedAt: null,
      regenerationPolicy: 'overwrite',
      manualEdits: [],
    };

    await repo.save(document1);
    await repo.save(document2);
    const loaded = await repo.loadLatest();

    expect(loaded?.id).toBe('okr-2');
    expect(loaded?.objective).toBe('Second objective');
  });
});
