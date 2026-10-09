import { jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { OKRDocument } from '@clarityokr/contracts';
import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager';
import { SqliteSessionRepository } from '@clarityokr/main/persistence/sqlite-session-repository';
import { OKRRepositorySqlite } from '@clarityokr/main/persistence/okr-repository';
import {
  ClarificationSessionManager,
  ClarificationStateMachine,
} from '@clarityokr/main/clarification/index';
import { TestMode } from '@clarityokr/main/test-mode';
import {
  initializeTestMode,
  getTestMode,
  isTestModeEnabled,
} from '@clarityokr/main/test-mode/index';
import type { TestModeDependencies } from '@clarityokr/main/test-mode/index';

const okr: OKRDocument = {
  id: 'synthetic-okr',
  objective: 'Synthetic objective',
  keyResults: [{ id: 'kr', statement: 'Measure', target: '1', measurement: 'count' }],
  sourceSessionId: 'synthetic-session',
  generatedAt: '2026-01-01T00:00:00.000Z',
  lastEditedAt: null,
  regenerationPolicy: 'append',
  manualEdits: [],
};

describe('Actual TestMode with session manager and SQLite persistence', () => {
  let database: ConnectionManager;
  let sessionRepo: SqliteSessionRepository;
  let okrRepo: OKRRepositorySqlite;
  let manager: ClarificationSessionManager;
  let mode: TestMode;
  let scratch: string;
  let dependencies: TestModeDependencies;
  const originalDataDir = process.env.CLARITY_OKR_DATA_DIR;
  const append = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  beforeEach(() => {
    scratch = mkdtempSync(join(process.cwd(), 'test-mode-fixture-'));
    process.env.CLARITY_OKR_DATA_DIR = scratch;
    database = new ConnectionManager({ dbPath: ':memory:' });
    database.initialize();
    sessionRepo = new SqliteSessionRepository(database);
    okrRepo = new OKRRepositorySqlite(database);
    manager = new ClarificationSessionManager(sessionRepo, new ClarificationStateMachine());
    dependencies = {
      controller: {
        resetSessions: () => manager.cleanupSessions(),
        setSession: (id, data) => manager.setSession(id, data),
        getSessionForTest: async (id) => (await manager.getSession(id)) ?? undefined,
        getAllSessions: () => manager.getAllSessions(),
        getCurrentSessionId: () => manager.getCurrentSessionId(),
      },
      sessionRepo,
      okrRepo,
      actionLogWriter: { append },
    };
    mode = new TestMode(dependencies);
    append.mockClear();
  });
  afterEach(() => {
    database?.close();
    if (scratch) rmSync(scratch, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.CLARITY_OKR_DATA_DIR;
    else process.env.CLARITY_OKR_DATA_DIR = originalDataDir;
    jest.useRealTimers();
  });

  it('initializes the public API once for the current Electron owner and exposes the actual test object', () => {
    expect(getTestMode()).toBeNull();
    expect(isTestModeEnabled()).toBe(false);
    const initialized = initializeTestMode(dependencies);
    expect(getTestMode()).toBe(initialized);
    expect(isTestModeEnabled()).toBe(true);
    expect(Reflect.get(globalThis, 'testMode')).toBe(initialized);
  });

  it('reports persistence reset failures and keeps failed OKR deletes visible', async () => {
    await mode.createMockSession({ initialIntent: 'Synthetic persisted session' });
    database.close();
    await expect(mode.resetPersistence()).rejects.toThrow('Database not initialized');
    await expect(mode.clearOKRs()).rejects.toThrow('Failed to clear OKR documents');
    await expect(mode.resetState()).rejects.toThrow('Database not initialized');
  });

  it('clears actual persisted sessions and OKRs, then can begin a clean session', async () => {
    const id = await mode.createMockSession({ initialIntent: 'First intent' });
    expect((await mode.getSession(id))?.initialIntent).toBe('First intent');
    await mode.saveOKR(okr);
    expect(await mode.getLatestOKR()).toEqual(okr);
    await mode.resetPersistence();
    expect(await sessionRepo.getAll()).toEqual([]);
    expect(await mode.getLatestOKR()).toBeNull();
    await mode.resetSession();
    expect(mode.getAllSessions().size).toBe(0);
    expect(await mode.getSession(id)).toBeUndefined();
    const next = await mode.createMockSession({ initialIntent: 'Next intent' });
    expect(next).not.toBe(id);
    expect(await sessionRepo.getById(next)).not.toBeNull();
    await mode.clearOKRs();
    expect(await mode.getLatestOKR()).toBeNull();
  });

  it('resets memory, persistence and mock configuration and records the reset action', async () => {
    await mode.createMockSession({ status: 'ready', confidence: 0.9 });
    await mode.saveOKR(okr);
    mode.setMockLLMResponse('draft', { draft: 'synthetic' });
    mode.setMockResponseConfig({ nextQuestion: () => null, rawResponse: 'synthetic response' });
    await mode.resetState();
    expect(mode.getAllSessions().size).toBe(0);
    expect(await sessionRepo.getAll()).toEqual([]);
    expect(await mode.getLatestOKR()).toBeNull();
    expect(mode.getMockResponseConfig()).toEqual({});
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'test-mode', payloadSummary: 'Test mode state reset' }),
    );
  });

  it('reports actual pause and mock state to subscribers and isolates throwing observers', async () => {
    const changed = jest.fn();
    const unsubscribe = mode.subscribeToStateChanges(changed);
    const removeFaulty = mode.subscribeToStateChanges(() => {
      throw new Error('observer failed');
    });
    mode.setMockLLMResponse('nextQuestion', { question: 'synthetic' });
    mode.setMockResponseConfig({ rawResponse: 'synthetic response' });
    mode.pauseAsyncOperations();
    expect(changed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        asyncPaused: true,
        mockResponses: { rawResponse: 'synthetic response' },
      }),
    );
    expect(mode.getCurrentState().asyncPaused).toBe(true);
    mode.resumeAsyncOperations();
    await mode.waitForAsyncOperations();
    expect(mode.getCurrentState().asyncPaused).toBe(false);
    const calls = changed.mock.calls.length;
    unsubscribe();
    removeFaulty();
    mode.clearMockResponses();
    expect(changed).toHaveBeenCalledTimes(calls);
  });

  it('waits for queued operations to finish, contains rejection, and cleans up timed-out waiters', async () => {
    jest.useFakeTimers();
    const completed: string[] = [];
    expect(
      mode.enqueueIfPaused(async () => {
        completed.push('unused');
      }),
    ).toBe(false);
    mode.pauseAsyncOperations();
    const queued = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('operation failed'));
    mode.enqueueIfPaused(queued);
    mode.enqueueIfPaused(async () => {
      completed.push('second');
    });
    let release: (() => void) | undefined;
    mode.enqueueIfPaused(
      async () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const waiting = mode.waitForAsyncOperations();
    mode.resumeAsyncOperations();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });
    mode.resumeAsyncOperations();
    await jest.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);
    release?.();
    await waiting;
    expect(queued).toHaveBeenCalledTimes(1);
    expect(completed).toEqual(['second']);
    mode.pauseAsyncOperations();
    const timedOut = mode.waitForAsyncOperations(10);
    const rejected = expect(timedOut).rejects.toThrow('Timeout');
    await jest.advanceTimersByTimeAsync(10);
    await rejected;
    expect(jest.getTimerCount()).toBe(0);
    mode.resumeAsyncOperations();
  });
});
