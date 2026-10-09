import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { SessionRepository } from '@clarityokr/main/persistence/session-repository.js';
import {
  encryptionService,
  generateEncryptionKey,
} from '@clarityokr/main/services/encryption.service.js';
import { atomicPersistence } from '@clarityokr/main/persistence/atomic-persistence.service.js';
import {
  readEncryptedJson,
  writeEncryptedJson,
  migrateToEncrypted,
  cleanupOrphanedTempFiles,
} from '@clarityokr/main/persistence/encrypted-persistence.js';
import type { ClarificationSession, OKRDocument, UserActionLogEntry } from '@clarityokr/contracts';

const time = '2026-10-09T00:00:00.000Z';
const session = (id: string): ClarificationSession => ({
  id,
  initialIntent: 'Only synthetic test intent',
  status: 'collecting',
  createdAt: time,
  updatedAt: time,
  steps: [],
  selectedOptions: [],
  confidence: 0,
});
const okr = (id: string, sourceSessionId: string): OKRDocument => ({
  id,
  sourceSessionId,
  objective: 'Only synthetic objective',
  keyResults: [{ id: 'kr', statement: 'Test result' }],
  generatedAt: time,
  regenerationPolicy: 'overwrite',
  manualEdits: [],
});
const action = (id: string, sessionId: string): UserActionLogEntry => ({
  id,
  sessionId,
  actionType: 'generate',
  payloadSummary: 'synthetic action',
  occurredAt: time,
});

describe('Actual encrypted session lifecycle and failure propagation', () => {
  let directory: string;
  let repository: SessionRepository;
  let key: Buffer;
  beforeEach(async () => {
    const parent = join(process.cwd(), 'tmp');
    await fs.mkdir(parent, { recursive: true });
    directory = await fs.mkdtemp(join(parent, 'encrypted-sessions-'));
    key = generateEncryptionKey();
    repository = new SessionRepository(directory, encryptionService, key);
  });
  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('persists only encrypted legacy state, appends actions and clears selected files', async () => {
    await repository.saveSession(session('a'));
    await repository.saveOKRDocument(okr('okr-a', 'a'));
    await repository.appendActionLog(action('one', 'a'));
    await repository.appendActionLog(action('two', 'a'));
    expect(await repository.load()).toEqual({
      session: session('a'),
      okr: okr('okr-a', 'a'),
      actions: [action('one', 'a'), action('two', 'a')],
    });
    const disk = await fs.readFile(join(directory, 'clarification-session.json'), 'utf8');
    expect(disk).not.toContain('Only synthetic test intent');
    await repository.replaceActionLog([action('replacement', 'a')]);
    expect((await repository.load()).actions).toEqual([action('replacement', 'a')]);
    await repository.saveSession(null);
    await repository.saveOKRDocument(null);
    expect(await repository.load()).toMatchObject({ session: null, okr: null });
    await repository.saveSession(null);
    await repository.saveOKRDocument(null);
  });

  it('migrates encrypted legacy sessions and maintains active-session ownership on deletion', async () => {
    expect(await repository.loadMultiSessionState()).toEqual({
      sessions: {},
      okrs: {},
      actions: {},
      activeSessionId: null,
    });
    await repository.saveSession(session('legacy'));
    await repository.appendActionLog(action('legacy-action', 'legacy'));
    expect(await repository.loadMultiSessionState()).toMatchObject({
      sessions: { legacy: session('legacy') },
      okrs: {},
      activeSessionId: 'legacy',
    });
    await repository.saveOKRDocument(okr('legacy-okr', 'legacy'));
    expect((await repository.loadMultiSessionState()).okrs).toEqual({
      legacy: okr('legacy-okr', 'legacy'),
    });
    await repository.saveSessionMulti(session('a'));
    await repository.saveSessionMulti(session('b'));
    await repository.saveOKRMulti('a', okr('okr-a', 'a'));
    expect(await repository.getSession('a')).toEqual(session('a'));
    expect(await repository.getSession('missing')).toBeNull();
    expect(await repository.getOKR('a')).toEqual(okr('okr-a', 'a'));
    expect(await repository.getOKR('missing')).toBeNull();
    expect((await repository.getAllSessions()).map((value) => value.id)).toEqual([
      'legacy',
      'a',
      'b',
    ]);
    await repository.setActiveSession('a');
    await repository.setActiveSession('missing');
    expect(await repository.getActiveSessionId()).toBe('a');
    await repository.deleteSession('b');
    expect(await repository.getActiveSessionId()).toBe('a');
    await repository.deleteSession('a');
    expect(await repository.getActiveSessionId()).toBe('legacy');
    expect(await repository.getOKR('a')).toBeNull();
    await repository.deleteSession('legacy');
    expect(await repository.getActiveSessionId()).toBeNull();
  });

  it('rejects actual disk write failures instead of claiming data was saved', async () => {
    for (const file of [
      'clarification-session.json',
      'okr-document.json',
      'action-log.json',
      'multi-sessions.json',
    ]) {
      await fs.mkdir(join(directory, file));
    }
    await expect(repository.saveSession(session('a'))).rejects.toThrow('persist');
    await expect(repository.saveOKRDocument(okr('a', 'a'))).rejects.toThrow('persist');
    await expect(repository.appendActionLog(action('a', 'a'))).rejects.toThrow('persist');
    await expect(repository.replaceActionLog([])).rejects.toThrow('persist');
    await expect(
      repository.saveMultiSessionState({
        sessions: {},
        okrs: {},
        actions: {},
        activeSessionId: null,
      }),
    ).rejects.toThrow('persist');
  });

  it('fails closed on missing encryption configuration and wrong keys without writing plaintext', async () => {
    const unavailable = new SessionRepository(directory);
    await expect(unavailable.saveSession(session('a'))).rejects.toThrow('Encryption');
    await expect(fs.access(join(directory, 'clarification-session.json'))).rejects.toThrow();
    expect(await unavailable.load()).toEqual({ session: null, okr: null, actions: [] });
    await repository.saveSession(session('a'));
    await repository.saveSessionMulti(session('a'));
    const wrongKey = new SessionRepository(directory, encryptionService, generateEncryptionKey());
    expect(await wrongKey.load()).toEqual({ session: null, okr: null, actions: [] });
    expect(await wrongKey.loadMultiSessionState()).toEqual({
      sessions: {},
      okrs: {},
      actions: {},
      activeSessionId: null,
    });
    expect((await repository.load()).session).toEqual(session('a'));
  });

  it('migrates a synthetic atomic plaintext record, preserves JSON data and rejects invalid crypto input', async () => {
    const file = join(directory, 'legacy.json');
    const data = { only: 'synthetic fixture' };
    await atomicPersistence.atomicWrite(file, data);
    expect(await readEncryptedJson(file, encryptionService, key)).toEqual(data);
    expect(await migrateToEncrypted(file, encryptionService, key)).toBe(true);
    expect(await readEncryptedJson(file, encryptionService, key)).toEqual(data);
    expect(await fs.readFile(file, 'utf8')).not.toContain('synthetic fixture');
    expect(await migrateToEncrypted(join(directory, 'missing'), encryptionService, key)).toBe(
      false,
    );
    await expect(
      writeEncryptedJson(file, data, encryptionService, Buffer.alloc(1)),
    ).rejects.toThrow('encrypt');
    await expect(readEncryptedJson(file, encryptionService, Buffer.alloc(1))).rejects.toThrow(
      'decrypt',
    );
    expect(await cleanupOrphanedTempFiles(directory)).toEqual([]);
  });
});
