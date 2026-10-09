import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager';
import { MigrationService } from '@clarityokr/main/persistence/migration.service';
import { atomicPersistence } from '@clarityokr/main/persistence/atomic-persistence.service';

const time = '2026-10-09T00:00:00.000Z';
const session = {
  id: 'synthetic',
  initialIntent: 'Synthetic intent',
  status: 'collecting',
  createdAt: time,
  updatedAt: time,
  steps: [],
  selectedOptions: [],
  confidence: 0,
};

describe('Real migration recovery boundaries', () => {
  let directory: string;
  let connection: ConnectionManager;
  let migration: MigrationService;
  beforeEach(async () => {
    const parent = join(process.cwd(), 'tmp');
    await fs.mkdir(parent, { recursive: true });
    directory = await fs.mkdtemp(join(parent, 'migration-boundaries-'));
    connection = new ConnectionManager({ dbPath: join(directory, 'database.sqlite') });
    connection.initialize();
    migration = new MigrationService(connection, directory);
  });
  afterEach(async () => {
    connection.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const write = async (file: string, data: unknown) => {
    const result = await atomicPersistence.atomicWrite(join(directory, file), data);
    expect(result.success).toBe(true);
  };
  it('refuses import when a real backup directory cannot be created, leaving data eligible to retry', async () => {
    await write('clarification-session.json', session);
    await fs.writeFile(join(directory, 'backup'), 'occupied');
    const result = await migration.migrate();
    expect(result.success).toBe(false);
    expect(result.sessionsMigrated).toBe(0);
    expect(migration.needsMigration()).toBe(true);
    expect(migration.getMigrationStatus().migrated).toBe(false);
    expect(connection.getDb().prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({
      n: 0,
    });
    await fs.unlink(join(directory, 'backup'));
    expect((await migration.migrate()).success).toBe(true);
  });
  it.each(['okr-document.json', 'action-log.json'])(
    'rolls back a good session when existing legacy %s is unreadable',
    async (filename) => {
      await write('clarification-session.json', session);
      await fs.writeFile(join(directory, filename), '{corrupt');
      const result = await migration.migrate();
      expect(result.success).toBe(false);
      expect(result.sessionsMigrated).toBe(0);
      expect(result.errors.join(' ')).toContain(
        filename === 'okr-document.json' ? 'legacy OKR' : 'legacy action log',
      );
      expect(migration.getMigrationStatus().migrated).toBe(false);
    },
  );
  it.each(['okr', 'action'])(
    'reports actual SQLite rejection of a legacy %s and rolls back its session',
    async (kind) => {
      await write('clarification-session.json', session);
      if (kind === 'okr')
        await write('okr-document.json', { id: 'broken-okr', sourceSessionId: session.id });
      else await write('action-log.json', [{ id: 'broken-action', sessionId: session.id }]);
      const result = await migration.migrate();
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toContain(`legacy ${kind === 'okr' ? 'OKR' : 'action'}`);
      expect(connection.getDb().prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({
        n: 0,
      });
    },
  );
  it('does not silently replace an unreadable multi-session snapshot with a legacy file', async () => {
    await fs.writeFile(join(directory, 'multi-sessions.json'), '{corrupt');
    await write('clarification-session.json', session);
    const result = await migration.migrate();
    expect(result.success).toBe(false);
    expect(result.sessionsMigrated).toBe(0);
    expect(result.errors.join(' ')).toContain('multi-session');
    expect(migration.needsMigration()).toBe(true);
  });
  it('imports a usable legacy file when the multi-session snapshot contains no sessions', async () => {
    await write('multi-sessions.json', {
      sessions: {},
      okrs: {},
      actions: {},
      activeSessionId: null,
    });
    await write('clarification-session.json', {
      ...session,
      selectedOptions: undefined,
      selectedOptionIds: ['unknown-choice'],
      steps: [{ id: 'no-options' }],
    });
    const result = await migration.migrate();
    expect(result.success).toBe(true);
    expect(result.sessionsMigrated).toBe(1);
    const row = connection
      .getDb()
      .prepare('SELECT selected_options FROM sessions WHERE id=?')
      .get(session.id) as { selected_options: string };
    expect(JSON.parse(row.selected_options)).toEqual([
      { promptId: 'unknown', optionId: 'unknown-choice', selectedAt: expect.any(String) },
    ]);
  });
  it('reports rollback failure when a SQLite trigger has already rolled the transaction back', async () => {
    await write('clarification-session.json', session);
    connection
      .getDb()
      .exec(
        "CREATE TRIGGER abort_import BEFORE INSERT ON sessions BEGIN SELECT RAISE(ROLLBACK, 'synthetic rollback'); END;",
      );
    const result = await migration.migrate();
    expect(result.success).toBe(false);
    expect(result.sessionsMigrated).toBe(0);
    expect(result.errors.join(' ')).toContain('Migration rollback failed');
    expect(migration.needsMigration()).toBe(true);
  });
  it('reports an unavailable database without claiming migration completed or ignoring existing JSON', async () => {
    await write('clarification-session.json', session);
    connection.close();
    const blocked = join(directory, 'blocked');
    await fs.writeFile(blocked, 'not a directory');
    const unavailable = new ConnectionManager({ dbPath: join(blocked, 'database.sqlite') });
    const service = new MigrationService(unavailable, directory);
    try {
      expect(service.needsMigration()).toBe(true);
      expect(service.getMigrationStatus()).toEqual({ migrated: false });
      expect((await service.migrate()).success).toBe(false);
    } finally {
      unavailable.close();
    }
  });
});
