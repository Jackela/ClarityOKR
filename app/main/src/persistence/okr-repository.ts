import type { ManualEditRecord, OKRDocument } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';

import type { DatabaseRow, OKRRepository } from './okr-repository.types.js';
import { detectChanges, OKR_QUERIES, rowToDocument } from './okr-repository.utils.js';
import type { DatabaseService } from './database.service.js';

/**
 * SQLite-based implementation of OKRRepository
 * Stores OKR documents with JSON-serialized complex fields
 */
export class OKRRepositorySqlite implements OKRRepository {
  private readonly db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  /**
   * Save an OKR document
   * Compares with existing document to detect changes and records edit history
   * Updates lastEditedAt timestamp automatically
   */
  async save(okr: OKRDocument): Promise<void> {
    try {
      // Check if this is an update or insert
      const existing = await this.findById(okr.id);

      if (existing) {
        // Detect changes and record edit history
        const edits = detectChanges(existing, okr);
        if (edits.length > 0) {
          // Append new edits to existing manualEdits
          okr.manualEdits = [...existing.manualEdits, ...edits];
          okr.lastEditedAt = new Date().toISOString();
        } else {
          // Preserve existing edits and timestamp if no new changes
          okr.manualEdits = okr.manualEdits ?? existing.manualEdits;
          okr.lastEditedAt = okr.lastEditedAt ?? existing.lastEditedAt;
        }
      }

      const database = this.db.getDb();
      const stmt = database.prepare(OKR_QUERIES.save);

      stmt.run(
        okr.id,
        okr.objective,
        JSON.stringify(okr.keyResults),
        okr.sourceSessionId,
        okr.generatedAt,
        okr.lastEditedAt ?? null,
        okr.regenerationPolicy,
        JSON.stringify(okr.manualEdits),
      );

      Logger.debug('[OKRRepository] Saved OKR document:', okr.id);
    } catch (error) {
      Logger.error('[OKRRepository] Failed to save OKR document:', error);
      throw new Error(
        `Failed to save OKR document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Find an OKR document by ID
   * Deserializes JSON fields back to objects
   */
  async findById(okrId: string): Promise<OKRDocument | null> {
    try {
      const database = this.db.getDb();
      const row = database.prepare(OKR_QUERIES.findById).get(okrId) as DatabaseRow | undefined;

      if (!row) {
        return null;
      }

      return rowToDocument(row);
    } catch (error) {
      Logger.error('[OKRRepository] Failed to find OKR by ID:', error);
      throw new Error(
        `Failed to find OKR document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Find all OKR documents for a given session
   * Returns documents ordered by generation time (newest first)
   */
  async findBySessionId(sessionId: string): Promise<OKRDocument[]> {
    try {
      const database = this.db.getDb();
      const rows = database.prepare(OKR_QUERIES.findBySessionId).all(sessionId) as DatabaseRow[];

      return rows.map(rowToDocument);
    } catch (error) {
      Logger.error('[OKRRepository] Failed to find OKRs by session ID:', error);
      throw new Error(
        `Failed to find OKR documents: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get the latest OKR document for a session
   * Returns the most recently generated document
   */
  async getLatestForSession(sessionId: string): Promise<OKRDocument | null> {
    try {
      const database = this.db.getDb();
      const row = database.prepare(OKR_QUERIES.getLatestForSession).get(sessionId) as
        | DatabaseRow
        | undefined;

      if (!row) {
        return null;
      }

      return rowToDocument(row);
    } catch (error) {
      Logger.error('[OKRRepository] Failed to get latest OKR:', error);
      throw new Error(
        `Failed to get latest OKR: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Load the latest OKR document across all sessions (backward compatibility)
   * @returns Promise resolving to the latest document or null
   */
  async loadLatest(): Promise<OKRDocument | null> {
    try {
      const database = this.db.getDb();
      const row = database.prepare(OKR_QUERIES.loadLatest).get() as DatabaseRow | undefined;

      if (!row) {
        return null;
      }

      return rowToDocument(row);
    } catch (error) {
      Logger.error('[OKRRepository] Failed to load latest OKR:', error);
      throw new Error(
        `Failed to load latest OKR: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Record a manual edit for an OKR document
   * Appends the edit to the manualEdits array and updates lastEditedAt
   */
  async recordEdit(okrId: string, edit: ManualEditRecord): Promise<void> {
    try {
      const existing = await this.findById(okrId);
      if (!existing) {
        throw new Error(`OKR document not found: ${okrId}`);
      }

      const database = this.db.getDb();
      const updatedEdits = [...existing.manualEdits, edit];
      const lastEditedAt = new Date().toISOString();

      database
        .prepare(OKR_QUERIES.recordEdit)
        .run(JSON.stringify(updatedEdits), lastEditedAt, okrId);

      Logger.debug('[OKRRepository] Recorded edit for OKR:', okrId, 'Edit ID:', edit.id);
    } catch (error) {
      Logger.error('[OKRRepository] Failed to record edit:', error);
      throw new Error(
        `Failed to record edit: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Backward-compatible alias for existing code
 * @deprecated Use OKRRepositorySqlite instead
 */
export { OKRRepositorySqlite as OkrRepository };
