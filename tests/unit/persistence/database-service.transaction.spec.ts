import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DatabaseService } from '@clarityokr/main/persistence/database.service';

describe('DatabaseService', () => {
  let db: DatabaseService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clarityokr-test-'));
    db = new DatabaseService({ dataDir: tempDir, filename: 'test.db' });
    db.initialize();
  });

  afterEach(() => {
    db.close();
  });

  describe('transaction', () => {
    it('should commit multiple operations atomically', () => {
      // Arrange
      const session = createTestSession('session-1');
      const okr = createTestOKR('okr-1', 'session-1');

      // Act
      db.transaction(() => {
        db.saveSession(session);
        db.saveOKR(okr);
      });

      // Assert
      const savedSession = db.getSession('session-1');
      const savedOKR = db.getOKR('okr-1');
      expect(savedSession).not.toBeNull();
      expect(savedOKR).not.toBeNull();
    });

    it('should rollback all operations when one fails', () => {
      // Arrange
      const session = createTestSession('session-2');

      // Act & Assert
      expect(() => {
        db.transaction(() => {
          db.saveSession(session);
          throw new Error('Intentional failure');
        });
      }).toThrow('Intentional failure');

      // Verify rollback
      const savedSession = db.getSession('session-2');
      expect(savedSession).toBeNull();
    });

    it('should return value from transaction callback', () => {
      // Arrange
      const session = createTestSession('session-3');

      // Act
      const result = db.transaction(() => {
        db.saveSession(session);
        return db.getSession('session-3');
      });

      // Assert
      expect(result).not.toBeNull();
      expect(result?.id).toBe('session-3');
    });
  });

  describe('selectedOptions column', () => {
    it('should save and retrieve selectedOptions as JSON', () => {
      // Arrange
      const session = createTestSession('session-4', {
        selectedOptions: [
          { promptId: 'prompt-1', optionId: 'opt-a', selectedAt: '2024-01-01T00:00:00Z' },
          { promptId: 'prompt-2', optionId: 'opt-b', selectedAt: '2024-01-01T00:01:00Z' },
        ],
      });

      // Act
      db.saveSession(session);
      const saved = db.getSession('session-4');

      // Assert
      expect(saved).not.toBeNull();
      expect(saved?.selectedOptions).toHaveLength(2);
      expect(saved?.selectedOptions[0]).toEqual({
        promptId: 'prompt-1',
        optionId: 'opt-a',
        selectedAt: '2024-01-01T00:00:00Z',
      });
    });

    it('should handle empty selectedOptions', () => {
      // Arrange
      const session = createTestSession('session-5', { selectedOptions: [] });

      // Act
      db.saveSession(session);
      const saved = db.getSession('session-5');

      // Assert
      expect(saved?.selectedOptions).toEqual([]);
    });
  });
});

// Test helpers
function createTestSession(
  id: string,
  overrides?: Partial<{
    selectedOptions: Array<{ promptId: string; optionId: string; selectedAt: string }>;
  }>,
) {
  return {
    id,
    initialIntent: 'Test intent',
    status: 'collecting' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [],
    selectedOptions: overrides?.selectedOptions ?? [],
    confidence: 0.5,
    pendingQuestionId: null,
  };
}

function createTestOKR(id: string, sourceSessionId: string) {
  return {
    id,
    objective: 'Test objective',
    keyResults: [],
    sourceSessionId,
    generatedAt: new Date().toISOString(),
    lastEditedAt: null,
    regenerationPolicy: 'overwrite' as const,
    manualEdits: [],
  };
}
