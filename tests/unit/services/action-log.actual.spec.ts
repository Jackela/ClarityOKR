import { jest } from '@jest/globals';
import { ActionLogService } from '@clarityokr/main/services/action-log.service';
import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager';
import { SQLiteActionLogWriter } from '@clarityokr/main/persistence/sqlite-action-log-writer';
import { Logger } from '@clarityokr/main/core/logger';

describe('Actual action logging boundary', () => {
  let db: ConnectionManager;
  let writer: SQLiteActionLogWriter;
  let service: ActionLogService;
  beforeEach(() => {
    db = new ConnectionManager({ dbPath: ':memory:' });
    db.initialize();
    writer = new SQLiteActionLogWriter(db);
    service = new ActionLogService(writer);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    db.close();
  });
  it('persists an action with generated identity/time and nullable document identity', async () => {
    await service.logAction('generate', 'synthetic', null, 'Synthetic prompt');
    const logs = await writer.all();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actionType: 'generate',
      sessionId: 'synthetic',
      okrId: null,
      payloadSummary: 'Synthetic prompt',
    });
    expect(logs[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isFinite(Date.parse(logs[0].occurredAt))).toBe(true);
    db.close();
    await expect(service.logAction('copy', 'synthetic', 'okr', 'copy')).rejects.toThrow(
      'Database not initialized',
    );
  });
  it.each([new Error('original error'), 'opaque failure', { reason: 'provider stopped' }, null, 0])(
    'logs unknown failures without throwing (%p)',
    (failure) => {
      const log = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
      service.logUnexpectedError('Synthetic context', failure);
      expect(log).toHaveBeenCalledWith('Synthetic context', expect.any(Error));
      if (failure instanceof Error) expect(log.mock.calls[0][1]).toBe(failure);
      else
        expect((log.mock.calls[0][1] as Error).message).toContain(
          typeof failure === 'object' && failure !== null ? 'provider stopped' : String(failure),
        );
    },
  );
  it('reports a cyclic external error object without failing error recovery', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const log = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    expect(() => service.logUnexpectedError('Synthetic context', cyclic)).not.toThrow();
    expect(log).toHaveBeenCalledWith(
      'Synthetic context',
      expect.objectContaining({ message: '[object Object]' }),
    );
  });
});
