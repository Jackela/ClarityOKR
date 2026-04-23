import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager';
import { SqliteSessionRepository } from '@clarityokr/main/persistence/sqlite-session-repository';
import type { ClarificationSession } from '@clarityokr/contracts';

describe('SqliteSessionRepository', () => {
  let db: ConnectionManager;
  let repo: SqliteSessionRepository;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clarityokr-test-'));
    db = new ConnectionManager({ dbPath: join(tempDir, 'test.db') });
    db.initialize();
    repo = new SqliteSessionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('save', () => {
    it('should save a session to SQLite', async () => {
      // Arrange
      const session = createTestSession('session-1');

      // Act
      await repo.save(session);

      // Assert
      const saved = await repo.getById('session-1');
      expect(saved).not.toBeNull();
      expect(saved?.id).toBe('session-1');
      expect(saved?.initialIntent).toBe('Test intent');
    });

    it('should update an existing session', async () => {
      // Arrange
      const session = createTestSession('session-1');
      await repo.save(session);

      // Act
      const updated = { ...session, initialIntent: 'Updated intent' };
      await repo.save(updated);

      // Assert
      const saved = await repo.getById('session-1');
      expect(saved?.initialIntent).toBe('Updated intent');
    });
  });

  describe('getById', () => {
    it('should return null for non-existent session', async () => {
      const result = await repo.getById('non-existent');
      expect(result).toBeNull();
    });

    it('should return session with selectedOptions', async () => {
      // Arrange
      const session = createTestSession('session-2', {
        selectedOptions: [
          { promptId: 'p1', optionId: 'o1', selectedAt: '2024-01-01T00:00:00Z' },
        ],
      });
      await repo.save(session);

      // Act
      const saved = await repo.getById('session-2');

      // Assert
      expect(saved?.selectedOptions).toHaveLength(1);
      expect(saved?.selectedOptions[0].promptId).toBe('p1');
    });
  });

  describe('getAll', () => {
    it('should return all sessions ordered by createdAt desc', async () => {
      // Arrange
      await repo.save(createTestSession('session-a', { createdAt: '2024-01-02T00:00:00Z' }));
      await repo.save(createTestSession('session-b', { createdAt: '2024-01-01T00:00:00Z' }));

      // Act
      const all = await repo.getAll();

      // Assert
      expect(all).toHaveLength(2);
      expect(all[0].id).toBe('session-a');
      expect(all[1].id).toBe('session-b');
    });

    it('should return empty array when no sessions exist', async () => {
      const all = await repo.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete a session', async () => {
      // Arrange
      await repo.save(createTestSession('session-3'));

      // Act
      await repo.delete('session-3');

      // Assert
      const saved = await repo.getById('session-3');
      expect(saved).toBeNull();
    });
  });
});

// Test helpers
function createTestSession(
  id: string,
  overrides?: Partial<ClarificationSession>,
): ClarificationSession {
  return {
    id,
    initialIntent: 'Test intent',
    status: 'collecting',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [],
    selectedOptions: [],
    confidence: 0.5,
    pendingQuestionId: null,
    ...overrides,
  };
}
