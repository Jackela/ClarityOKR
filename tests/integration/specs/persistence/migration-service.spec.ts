import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager.js';
import { MigrationService } from '@clarityokr/main/persistence/migration.service.js';
import { atomicPersistence } from '@clarityokr/main/persistence/atomic-persistence.service.js';

describe('MigrationService', () => {
  let tempDir: string;
  let db: ConnectionManager;
  let migrationService: MigrationService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clarityokr-test-'));
    db = new ConnectionManager({ dbPath: join(tempDir, 'test.db') });
    db.initialize();
    migrationService = new MigrationService(db, tempDir);
  });

  afterEach(() => {
    db.close();
  });

  describe('needsMigration', () => {
    it('should return true when JSON files exist and no migration record', async () => {
      // Arrange
      await atomicPersistence.atomicWrite(join(tempDir, 'clarification-session.json'), { id: 'test' });

      // Act
      const result = migrationService.needsMigration();

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when no JSON files exist', () => {
      const result = migrationService.needsMigration();
      expect(result).toBe(false);
    });

    it('should return false when migration already completed', async () => {
      // Arrange
      await atomicPersistence.atomicWrite(join(tempDir, 'clarification-session.json'), { id: 'test' });
      db.getDb().prepare('INSERT INTO migrations (version, migrated_at, source) VALUES (?, ?, ?)').run(
        'json-to-sqlite-v1',
        new Date().toISOString(),
        'test',
      );

      // Act
      const result = migrationService.needsMigration();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('migrate', () => {
    it('should migrate legacy single-session data', async () => {
      // Arrange
      const session = {
        id: 'legacy-session',
        initialIntent: 'Legacy intent',
        status: 'completed',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        steps: [],
        selectedOptionIds: ['opt-1', 'opt-2'],
        confidence: 0.8,
        pendingQuestionId: null,
      };
      await atomicPersistence.atomicWrite(join(tempDir, 'clarification-session.json'), session);

      // Act
      const result = await migrationService.migrate();

      // Assert
      expect(result.success).toBe(true);
      expect(result.sessionsMigrated).toBe(1);
      const hasMigration = db.getDb()
        .prepare('SELECT 1 FROM migrations WHERE version = ?')
        .get('json-to-sqlite-v1') !== undefined;
      expect(hasMigration).toBe(true);

      const migratedSession = db.getDb()
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get('legacy-session') as
        | { id: string; initial_intent: string; status: string; created_at: string; updated_at: string; steps: string; selected_options: string; confidence: number; pending_question_id: string | null }
        | undefined;
      expect(migratedSession).not.toBeUndefined();
      expect(migratedSession?.initial_intent).toBe('Legacy intent');
    });

    it('should transform selectedOptionIds to selectedOptions', async () => {
      // Arrange
      const session = {
        id: 'session-with-selections',
        initialIntent: 'Test',
        status: 'completed',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        steps: [
          { id: 'prompt-1', question: 'Q1', sequence: 1, context: 'ctx', options: [{ id: 'opt-1', label: 'A', scopeTag: 's1' }] },
          { id: 'prompt-2', question: 'Q2', sequence: 2, context: 'ctx', options: [{ id: 'opt-2', label: 'B', scopeTag: 's2' }] },
        ],
        selectedOptionIds: ['opt-1', 'opt-2'],
        confidence: 0.8,
        pendingQuestionId: null,
      };
      await atomicPersistence.atomicWrite(join(tempDir, 'clarification-session.json'), session);

      // Act
      await migrationService.migrate();

      // Assert
      const migrated = db.getDb()
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get('session-with-selections') as
        | { id: string; initial_intent: string; status: string; created_at: string; updated_at: string; steps: string; selected_options: string; confidence: number; pending_question_id: string | null }
        | undefined;
      const selectedOptions = migrated ? JSON.parse(migrated.selected_options) : [];
      expect(selectedOptions).toHaveLength(2);
      expect(selectedOptions[0]).toEqual({
        promptId: 'prompt-1',
        optionId: 'opt-1',
        selectedAt: expect.any(String),
      });
    });

    it('should be idempotent', async () => {
      // Arrange
      await atomicPersistence.atomicWrite(join(tempDir, 'clarification-session.json'), { id: 'test' });

      // Act
      const first = await migrationService.migrate();
      const second = await migrationService.migrate();

      // Assert
      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(second.sessionsMigrated).toBe(0); // No-op
    });

    it('should create backup of JSON files before migration', async () => {
      // Arrange
      await atomicPersistence.atomicWrite(join(tempDir, 'clarification-session.json'), { id: 'test' });

      // Act
      await migrationService.migrate();

      // Assert
      const backupDir = join(tempDir, 'backup');
      expect(existsSync(backupDir)).toBe(true);
    });
  });
});
