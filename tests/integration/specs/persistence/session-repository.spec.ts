import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionRepository } from '../../../../app/main/src/persistence/session-repository';

describe('SessionRepository Integration', () => {
  let testDir: string;
  let repo: SessionRepository;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'clarityokr-session-test-'));
    repo = new SessionRepository(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('saves and loads session data', async () => {
    const session = {
      id: 'test-session-1',
      initialIntent: 'improve productivity',
      status: 'collecting' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      selectedOptionIds: [],
      confidence: 0,
      pendingQuestionId: null,
    };

    await repo.saveSession(session);
    const loaded = await repo.load();

    expect(loaded.session).toEqual(session);
    expect(loaded.session?.status).toBe('collecting');
  });

  it('creates new session if file does not exist', async () => {
    const loaded = await repo.load();

    expect(loaded.session).toBeNull();
  });
});
