import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DatabaseService } from '@clarityokr/main/persistence/database.service';
import { OKRRepositorySqlite } from '@clarityokr/main/persistence/okr-repository';
import type { OKRDocument, ManualEditRecord } from '@clarityokr/contracts';
import { PersistenceError } from '@clarityokr/contracts';

describe('OKRRepositorySqlite', () => {
  let db: DatabaseService;
  let repo: OKRRepositorySqlite;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clarityokr-okr-test-'));
    db = new DatabaseService({ dataDir: tempDir, filename: 'test.db' });
    db.initialize();
    repo = new OKRRepositorySqlite(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('save', () => {
    it('should save a new OKR document', async () => {
      // Arrange
      const okr = createTestOKR('okr-1');

      // Act
      await repo.save(okr);

      // Assert
      const saved = await repo.findById('okr-1');
      expect(saved).not.toBeNull();
      expect(saved?.id).toBe('okr-1');
      expect(saved?.objective).toBe('Test Objective');
      expect(saved?.keyResults).toHaveLength(2);
    });

    it('should update an existing OKR document', async () => {
      // Arrange
      const okr = createTestOKR('okr-1');
      await repo.save(okr);

      // Act
      const updated = { ...okr, objective: 'Updated Objective' };
      await repo.save(updated);

      // Assert
      const saved = await repo.findById('okr-1');
      expect(saved?.objective).toBe('Updated Objective');
    });

    it('should detect changes and record edit history on update', async () => {
      // Arrange
      const okr = createTestOKR('okr-1', {
        keyResults: [
          { id: 'kr1', statement: 'Original KR1' },
          { id: 'kr2', statement: 'Original KR2' },
        ],
      });
      await repo.save(okr);

      const updated = {
        ...okr,
        objective: 'Updated Objective',
        keyResults: [
          { id: 'kr1', statement: 'Updated KR1' },
          { id: 'kr2', statement: 'Original KR2' },
        ],
      };
      await repo.save(updated);

      // Assert
      const saved = await repo.findById('okr-1');
      expect(saved?.manualEdits).toHaveLength(2);
      expect(saved?.manualEdits[0].fieldPath).toBe('objective');
      expect(saved?.manualEdits[0].previousValue).toBe('Test Objective');
      expect(saved?.manualEdits[0].newValue).toBe('Updated Objective');
      expect(saved?.lastEditedAt).toBeDefined();
    });

    it('should preserve existing edits when no new changes', async () => {
      // Arrange
      const okr = createTestOKR('okr-1');
      await repo.save(okr);

      const edit: ManualEditRecord = {
        id: 'edit-1',
        fieldPath: 'objective',
        previousValue: 'Old',
        newValue: 'New',
        editedAt: new Date().toISOString(),
      };
      await repo.recordEdit('okr-1', edit);

      const existing = await repo.findById('okr-1');
      if (!existing) throw new Error('Expected existing OKR');
      await repo.save(existing);

      // Assert
      const saved = await repo.findById('okr-1');
      expect(saved?.manualEdits).toHaveLength(1);
      expect(saved?.manualEdits[0].id).toBe('edit-1');
    });

    it('should throw PersistenceError on database failure', async () => {
      db.close();

      const okr = createTestOKR('okr-1');

      await expect(repo.save(okr)).rejects.toThrow(PersistenceError);
    });
  });

  describe('findById', () => {
    it('should return null for non-existent OKR', async () => {
      const result = await repo.findById('non-existent');
      expect(result).toBeNull();
    });

    it('should return OKR with deserialized keyResults', async () => {
      // Arrange
      const okr = createTestOKR('okr-2', {
        keyResults: [
          { id: 'kr1', statement: 'KR 1', successMetric: 'metric1', owner: 'Alice' },
          { id: 'kr2', statement: 'KR 2', successMetric: 'metric2', owner: 'Bob' },
        ],
      });
      await repo.save(okr);

      // Act
      const saved = await repo.findById('okr-2');

      // Assert
      expect(saved?.keyResults).toHaveLength(2);
      expect(saved?.keyResults[0].statement).toBe('KR 1');
      expect(saved?.keyResults[0].owner).toBe('Alice');
    });

    it('should throw PersistenceError on database failure', async () => {
      // Arrange
      db.close();

      await expect(repo.findById('okr-1')).rejects.toThrow(PersistenceError);
    });
  });

  describe('findBySessionId', () => {
    it('should return OKRs ordered by generatedAt desc', async () => {
      // Arrange
      await repo.save(createTestOKR('okr-a', { sourceSessionId: 'session-1', generatedAt: '2024-01-02T00:00:00Z' }));
      await repo.save(createTestOKR('okr-b', { sourceSessionId: 'session-1', generatedAt: '2024-01-01T00:00:00Z' }));

      // Act
      const results = await repo.findBySessionId('session-1');

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('okr-a');
      expect(results[1].id).toBe('okr-b');
    });

    it('should return empty array when no OKRs exist for session', async () => {
      const results = await repo.findBySessionId('non-existent-session');
      expect(results).toEqual([]);
    });

    it('should only return OKRs for the specified session', async () => {
      // Arrange
      await repo.save(createTestOKR('okr-1', { sourceSessionId: 'session-1' }));
      await repo.save(createTestOKR('okr-2', { sourceSessionId: 'session-2' }));

      // Act
      const results = await repo.findBySessionId('session-1');

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('okr-1');
    });

    it('should throw PersistenceError on database failure', async () => {
      // Arrange
      db.close();

      await expect(repo.findBySessionId('session-1')).rejects.toThrow(PersistenceError);
    });
  });

  describe('getLatestForSession', () => {
    it('should return the most recent OKR for a session', async () => {
      // Arrange
      await repo.save(createTestOKR('okr-old', { sourceSessionId: 'session-1', generatedAt: '2024-01-01T00:00:00Z' }));
      await repo.save(createTestOKR('okr-new', { sourceSessionId: 'session-1', generatedAt: '2024-01-03T00:00:00Z' }));
      await repo.save(createTestOKR('okr-mid', { sourceSessionId: 'session-1', generatedAt: '2024-01-02T00:00:00Z' }));

      // Act
      const latest = await repo.getLatestForSession('session-1');

      // Assert
      expect(latest?.id).toBe('okr-new');
    });

    it('should return null when no OKRs exist for session', async () => {
      const result = await repo.getLatestForSession('non-existent');
      expect(result).toBeNull();
    });

    it('should throw PersistenceError on database failure', async () => {
      // Arrange
      db.close();

      await expect(repo.getLatestForSession('session-1')).rejects.toThrow(PersistenceError);
    });
  });

  describe('loadLatest', () => {
    it('should return the latest OKR across all sessions', async () => {
      // Arrange
      await repo.save(createTestOKR('okr-1', { sourceSessionId: 'session-1', generatedAt: '2024-01-01T00:00:00Z' }));
      await repo.save(createTestOKR('okr-2', { sourceSessionId: 'session-2', generatedAt: '2024-01-05T00:00:00Z' }));

      // Act
      const latest = await repo.loadLatest();

      // Assert
      expect(latest?.id).toBe('okr-2');
    });

    it('should return null when no OKRs exist', async () => {
      const result = await repo.loadLatest();
      expect(result).toBeNull();
    });

    it('should throw PersistenceError on database failure', async () => {
      // Arrange
      db.close();

      await expect(repo.loadLatest()).rejects.toThrow(PersistenceError);
    });
  });

  describe('recordEdit', () => {
    it('should append an edit to manualEdits', async () => {
      // Arrange
      const okr = createTestOKR('okr-1');
      await repo.save(okr);

      const edit: ManualEditRecord = {
        id: 'edit-1',
        fieldPath: 'objective',
        previousValue: 'Old Objective',
        newValue: 'New Objective',
        editedAt: new Date().toISOString(),
      };

      // Act
      await repo.recordEdit('okr-1', edit);

      // Assert
      const saved = await repo.findById('okr-1');
      expect(saved?.manualEdits).toHaveLength(1);
      expect(saved?.manualEdits[0].id).toBe('edit-1');
      expect(saved?.lastEditedAt).toBeDefined();
    });

    it('should throw PersistenceError when OKR not found', async () => {
      const edit: ManualEditRecord = {
        id: 'edit-1',
        fieldPath: 'objective',
        previousValue: 'Old',
        newValue: 'New',
        editedAt: new Date().toISOString(),
      };

      await expect(repo.recordEdit('non-existent', edit)).rejects.toThrow(PersistenceError);
    });

    it('should throw PersistenceError on database failure', async () => {
      // Arrange
      const okr = createTestOKR('okr-1');
      await repo.save(okr);
      db.close();

      const edit: ManualEditRecord = {
        id: 'edit-1',
        fieldPath: 'objective',
        previousValue: 'Old',
        newValue: 'New',
        editedAt: new Date().toISOString(),
      };

      await expect(repo.recordEdit('okr-1', edit)).rejects.toThrow(PersistenceError);
    });
  });

  describe('close', () => {
    it('should close the database connection', () => {
      // Act
      repo.close();

      // Assert
      expect(() => db.getDb()).toThrow('Database not initialized. Call initialize() first.');
    });
  });
});

function createTestOKR(id: string, overrides?: Partial<OKRDocument>): OKRDocument {
  return {
    id,
    objective: 'Test Objective',
    keyResults: [
      { id: 'kr1', statement: 'Key Result 1' },
      { id: 'kr2', statement: 'Key Result 2' },
    ],
    sourceSessionId: 'session-1',
    generatedAt: new Date().toISOString(),
    lastEditedAt: null,
    regenerationPolicy: 'overwrite',
    manualEdits: [],
    ...overrides,
  };
}
