import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager';

describe('ConnectionManager', () => {
  let manager: ConnectionManager;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clarityokr-conn-test-'));
    dbPath = join(tempDir, 'test.db');
    manager = new ConnectionManager({ dbPath });
  });

  afterEach(() => {
    manager.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('connect', () => {
    it('should return a Database instance', () => {
      const db = manager.connect();
      expect(db).toBeDefined();
      expect(typeof db.prepare).toBe('function');
    });

    it('should return the same instance on subsequent calls', () => {
      const db1 = manager.connect();
      const db2 = manager.connect();
      expect(db1).toBe(db2);
    });

    it('should configure WAL mode', () => {
      const db = manager.connect();
      const journalMode = db.pragma('journal_mode', { simple: true });
      expect(journalMode).toBe('wal');
    });

    it('should enable foreign keys', () => {
      const db = manager.connect();
      const foreignKeys = db.pragma('foreign_keys', { simple: true });
      expect(foreignKeys).toBe(1);
    });
  });

  describe('initialize', () => {
    it('should create all required tables', () => {
      manager.initialize();
      const db = manager.getDb();

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('sessions');
      expect(tableNames).toContain('okr_documents');
      expect(tableNames).toContain('action_logs');
      expect(tableNames).toContain('migrations');
    });

    it('should be idempotent', () => {
      manager.initialize();
      manager.initialize();

      const db = manager.getDb();
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('sessions');
    });
  });

  describe('getDb', () => {
    it('should throw if not initialized', () => {
      expect(() => manager.getDb()).toThrow('Database not initialized. Call initialize() first.');
    });

    it('should return db after initialize', () => {
      manager.initialize();
      const db = manager.getDb();
      expect(db).toBeDefined();
    });

    it('should return db after connect', () => {
      manager.connect();
      const db = manager.getDb();
      expect(db).toBeDefined();
    });
  });

  describe('transaction', () => {
    beforeEach(() => {
      manager.initialize();
    });

    it('should commit operations atomically', () => {
      const db = manager.getDb();

      manager.transaction(() => {
        db.prepare('INSERT INTO sessions (id, initial_intent, status, created_at, updated_at, steps, selected_options, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
          'session-1', 'intent', 'collecting', '2024-01-01', '2024-01-01', '[]', '[]', 0.5,
        );
        db.prepare('INSERT INTO action_logs (id, action_type, session_id, payload_summary, occurred_at) VALUES (?, ?, ?, ?, ?)').run(
          'log-1', 'generate', 'session-1', 'summary', '2024-01-01',
        );
      });

      const sessionCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
      const logCount = db.prepare('SELECT COUNT(*) as count FROM action_logs').get() as { count: number };

      expect(sessionCount.count).toBe(1);
      expect(logCount.count).toBe(1);
    });

    it('should rollback on error', () => {
      const db = manager.getDb();

      expect(() => {
        manager.transaction(() => {
          db.prepare('INSERT INTO sessions (id, initial_intent, status, created_at, updated_at, steps, selected_options, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
            'session-2', 'intent', 'collecting', '2024-01-01', '2024-01-01', '[]', '[]', 0.5,
          );
          throw new Error('Intentional failure');
        });
      }).toThrow('Intentional failure');

      const row = db.prepare('SELECT id FROM sessions WHERE id = ?').get('session-2');
      expect(row).toBeUndefined();
    });

    it('should return value from callback', () => {
      const result = manager.transaction(() => {
        return 42;
      });

      expect(result).toBe(42);
    });
  });

  describe('close', () => {
    it('should close the connection', () => {
      manager.initialize();
      manager.close();

      expect(() => manager.getDb()).toThrow('Database not initialized. Call initialize() first.');
    });

    it('should be safe to call multiple times', () => {
      manager.initialize();
      manager.close();
      manager.close();

      expect(() => manager.getDb()).toThrow('Database not initialized. Call initialize() first.');
    });

    it('should allow re-initialization after close', () => {
      manager.initialize();
      manager.close();
      manager.initialize();

      const db = manager.getDb();
      expect(db).toBeDefined();
    });
  });
});
