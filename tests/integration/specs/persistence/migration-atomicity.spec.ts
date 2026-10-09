import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager.js';
import { MigrationService } from '@clarityokr/main/persistence/migration.service.js';
import { atomicPersistence } from '@clarityokr/main/persistence/atomic-persistence.service.js';

const time = '2026-10-09T00:00:00.000Z';
const session = {
  id: 'a',
  initialIntent: 'Synthetic intent',
  status: 'completed',
  createdAt: time,
  updatedAt: time,
  steps: [],
  selectedOptions: [],
  confidence: 1,
};
const okr = {
  id: 'okr-a',
  sourceSessionId: 'a',
  objective: 'Synthetic objective',
  keyResults: [],
  generatedAt: time,
  regenerationPolicy: 'overwrite',
  manualEdits: [],
};
const action = {
  id: 'action-a',
  sessionId: 'a',
  actionType: 'generate',
  payloadSummary: 'Synthetic',
  occurredAt: time,
};

describe('Actual SQLite migration commits complete snapshots only', () => {
  let directory: string;
  let connection: ConnectionManager;
  let migration: MigrationService;
  beforeEach(async () => {
    const parent = join(process.cwd(), 'tmp');
    await fs.mkdir(parent, { recursive: true });
    directory = await fs.mkdtemp(join(parent, 'migration-atomicity-'));
    connection = new ConnectionManager({ dbPath: join(directory, 'db.sqlite') });
    connection.initialize();
    migration = new MigrationService(connection, directory);
  });
  afterEach(async () => {
    connection.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('keeps an unreadable legacy file eligible for recovery instead of marking it migrated', async () => {
    await fs.writeFile(join(directory, 'clarification-session.json'), '{corrupt');
    const result = await migration.migrate();
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toContain('legacy session');
    expect(migration.needsMigration()).toBe(true);
    expect(migration.getMigrationStatus().migrated).toBe(false);
  });

  it.each(['okr', 'action'])(
    'rolls back valid sessions when a linked %s is invalid',
    async (kind) => {
      const state = {
        sessions: { a: session },
        okrs: { a: kind === 'okr' ? { ...okr, objective: undefined } : okr },
        actions: { a: [kind === 'action' ? { ...action, payloadSummary: undefined } : action] },
        activeSessionId: 'a',
      };
      await atomicPersistence.atomicWrite(join(directory, 'multi-sessions.json'), state);
      const result = await migration.migrate();
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toContain(kind === 'okr' ? 'okr-a' : 'action-a');
      expect(connection.getDb().prepare('SELECT count(*) AS count FROM sessions').get()).toEqual({
        count: 0,
      });
      expect(migration.needsMigration()).toBe(true);
    },
  );

  it('rolls back a partially invalid snapshot and retries after its record is corrected', async () => {
    const file = join(directory, 'multi-sessions.json');
    const state = {
      sessions: { a: session, bad: { ...session, id: 'bad', initialIntent: undefined } },
      okrs: { a: okr },
      actions: { a: [action] },
      activeSessionId: 'a',
    };
    await atomicPersistence.atomicWrite(file, state);
    const failed = await migration.migrate();
    expect(failed.success).toBe(false);
    expect(failed.errors.join(' ')).toContain('bad');
    expect(failed.sessionsMigrated).toBe(0);
    expect(failed.okrsMigrated).toBe(0);
    expect(failed.actionsMigrated).toBe(0);
    expect(connection.getDb().prepare('SELECT count(*) AS count FROM sessions').get()).toEqual({
      count: 0,
    });
    expect(connection.getDb().prepare('SELECT count(*) AS count FROM action_logs').get()).toEqual({
      count: 0,
    });
    expect(migration.needsMigration()).toBe(true);
    expect(migration.getMigrationStatus()).toEqual({
      migrated: false,
      version: undefined,
      migratedAt: undefined,
    });
    await atomicPersistence.atomicWrite(file, { ...state, sessions: { a: session } });
    const repaired = await migration.migrate();
    expect(repaired).toMatchObject({
      success: true,
      sessionsMigrated: 1,
      okrsMigrated: 1,
      actionsMigrated: 1,
      errors: [],
    });
    expect(connection.getDb().prepare('SELECT count(*) AS count FROM action_logs').get()).toEqual({
      count: 1,
    });
    expect(migration.needsMigration()).toBe(false);
    expect(migration.getMigrationStatus()).toMatchObject({
      migrated: true,
      version: 'json-to-sqlite-v1',
    });
    expect((await migration.migrate()).sessionsMigrated).toBe(0);
    expect((await fs.readdir(join(directory, 'backup'))).length).toBeGreaterThan(0);
  });
});
