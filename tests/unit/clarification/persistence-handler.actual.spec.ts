import { jest } from '@jest/globals';
import type { ClarificationSession } from '@clarityokr/contracts';
import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager';
import { SqliteSessionRepository } from '@clarityokr/main/persistence/sqlite-session-repository';
import {
  ClarificationPersistenceHandler,
  PersistenceError,
} from '@clarityokr/main/clarification/index';

function session(id: string, updatedAt: string): ClarificationSession {
  return {
    id,
    initialIntent: 'Synthetic intent',
    status: 'collecting',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    steps: [],
    selectedOptions: [],
    confidence: 0.3,
    pendingQuestionId: null,
  };
}

describe('Actual clarification persistence workflow with SQLite', () => {
  let database: ConnectionManager;
  let repository: SqliteSessionRepository;
  let handler: ClarificationPersistenceHandler;
  beforeEach(() => {
    database = new ConnectionManager({ dbPath: ':memory:' });
    database.initialize();
    repository = new SqliteSessionRepository(database);
    handler = new ClarificationPersistenceHandler(repository);
  });
  afterEach(() => database.close());

  it('restores the last updated session, then deletes all persisted sessions', async () => {
    expect(await handler.restoreSession()).toBeNull();
    const older = session('old', '2026-01-01T00:00:00.000Z');
    const newer = session('new', '2026-02-01T00:00:00.000Z');
    await handler.persistSession(newer);
    await handler.persistSession(older);
    expect(await handler.restoreSession()).toEqual(newer);
    expect(await repository.getAll()).toHaveLength(2);
    await handler.clearPersistence();
    expect(await repository.getAll()).toEqual([]);
    expect(await handler.restoreSession()).toBeNull();
  });

  it.each(['save', 'getAll', 'delete'] as const)(
    'makes a %s failure visible to its caller',
    async (operation) => {
      await handler.persistSession(session('synthetic', '2026-01-01T00:00:00.000Z'));
      database.close();
      const action =
        operation === 'save'
          ? handler.persistSession(session('new', '2026-02-01T00:00:00.000Z'))
          : operation === 'getAll'
            ? handler.restoreSession()
            : handler.clearPersistence();
      await expect(action).rejects.toBeInstanceOf(PersistenceError);
      await expect(action).rejects.toThrow('Database not initialized');
    },
  );

  it('preserves unknown external failures as a typed error instead of reporting success', async () => {
    jest.spyOn(repository, 'save').mockRejectedValue('opaque storage failure');
    await expect(
      handler.persistSession(session('synthetic', '2026-01-01T00:00:00.000Z')),
    ).rejects.toThrow('Unknown error');
    jest.spyOn(repository, 'getAll').mockRejectedValue('opaque storage failure');
    await expect(handler.restoreSession()).rejects.toThrow('Unknown error');
    await expect(handler.clearPersistence()).rejects.toThrow('Unknown error');
  });

  it('reports a deletion failure after enumeration without claiming the data is clear', async () => {
    await handler.persistSession(session('retained', '2026-01-01T00:00:00.000Z'));
    jest.spyOn(repository, 'delete').mockRejectedValue(new Error('delete refused'));
    await expect(handler.clearPersistence()).rejects.toThrow('delete refused');
    expect(await repository.getById('retained')).not.toBeNull();
  });
});
