import type {
  KeyResult,
  ManualEditRecord,
  OKRDocument,
  RegenerationPolicy,
} from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import { randomUUID } from 'crypto';

import { DatabaseService } from './database.service.js';

/**
 * Repository interface for OKR document persistence operations
 */
export interface OKRRepository {
  /**
   * Save an OKR document to the database
   * @param okr - The OKR document to save
   * @returns Promise that resolves when saved
   */
  save(okr: OKRDocument): Promise<void>;

  /**
   * Find an OKR document by its ID
   * @param okrId - The OKR document ID
   * @returns Promise resolving to the document or null if not found
   */
  findById(okrId: string): Promise<OKRDocument | null>;

  /**
   * Find all OKR documents associated with a session
   * @param sessionId - The source session ID
   * @returns Promise resolving to array of OKR documents
   */
  findBySessionId(sessionId: string): Promise<OKRDocument[]>;

  /**
   * Get the most recently generated OKR for a session
   * @param sessionId - The source session ID
   * @returns Promise resolving to the latest document or null
   */
  getLatestForSession(sessionId: string): Promise<OKRDocument | null>;

  /**
   * Record a manual edit for an OKR document
   * @param okrId - The OKR document ID
   * @param edit - The manual edit record to add
   * @returns Promise that resolves when recorded
   */
  recordEdit(okrId: string, edit: ManualEditRecord): Promise<void>;
}

/**
 * SQLite-based implementation of OKRRepository
 * Stores OKR documents with JSON-serialized complex fields
 */
export class OKRRepositorySqlite implements OKRRepository {
  private readonly db: DatabaseService;

  constructor(dataDir?: string) {
    this.db = new DatabaseService({ dataDir });
    this.db.initialize();
    this.ensureTableExists();
  }

  /**
   * Ensure the okr_documents table exists with proper schema and foreign key
   */
  private ensureTableExists(): void {
    const database = this.db.getDb();

    database.exec(`
      CREATE TABLE IF NOT EXISTS okr_documents (
        id TEXT PRIMARY KEY,
        objective TEXT NOT NULL,
        key_results TEXT NOT NULL,
        source_session_id TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        last_edited_at TEXT,
        regeneration_policy TEXT DEFAULT 'overwrite',
        manual_edits TEXT DEFAULT '[]',
        FOREIGN KEY (source_session_id) REFERENCES clarification_sessions(id)
      );
    `);

    Logger.debug('[OKRRepository] Table okr_documents ensured');
  }

  /**
   * Save an OKR document
   * Compares with existing document to detect changes and records edit history
   * Updates lastEditedAt timestamp automatically
   */
  async save(okr: OKRDocument): Promise<void> {
    try {
      const database = this.db.getDb();

      // Check if this is an update or insert
      const existing = await this.findById(okr.id);

      if (existing) {
        // Detect changes and record edit history
        const edits = this.detectChanges(existing, okr);
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

      const stmt = database.prepare(`
        INSERT OR REPLACE INTO okr_documents
        (id, objective, key_results, source_session_id, generated_at, last_edited_at, regeneration_policy, manual_edits)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

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
      const row = database
        .prepare(
          `
        SELECT id, objective, key_results, source_session_id,
               generated_at, last_edited_at, regeneration_policy, manual_edits
        FROM okr_documents WHERE id = ?
      `,
        )
        .get(okrId) as DatabaseRow | undefined;

      if (!row) {
        return null;
      }

      return this.rowToDocument(row);
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
      const rows = database
        .prepare(
          `
        SELECT id, objective, key_results, source_session_id,
               generated_at, last_edited_at, regeneration_policy, manual_edits
        FROM okr_documents
        WHERE source_session_id = ?
        ORDER BY generated_at DESC
      `,
        )
        .all(sessionId) as DatabaseRow[];

      return rows.map((row) => this.rowToDocument(row));
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
      const row = database
        .prepare(
          `
        SELECT id, objective, key_results, source_session_id,
               generated_at, last_edited_at, regeneration_policy, manual_edits
        FROM okr_documents
        WHERE source_session_id = ?
        ORDER BY generated_at DESC
        LIMIT 1
      `,
        )
        .get(sessionId) as DatabaseRow | undefined;

      if (!row) {
        return null;
      }

      return this.rowToDocument(row);
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
      const row = database
        .prepare(
          `
        SELECT id, objective, key_results, source_session_id,
               generated_at, last_edited_at, regeneration_policy, manual_edits
        FROM okr_documents
        ORDER BY generated_at DESC
        LIMIT 1
      `,
        )
        .get() as DatabaseRow | undefined;

      if (!row) {
        return null;
      }

      return this.rowToDocument(row);
    } catch (error) {
      Logger.error('[OKRRepository] Failed to load latest OKR:', error);
      throw new Error(
        `Failed to load latest OKR: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }


  /**
   * Convert a database row to OKRDocument
   * Handles JSON parsing for complex fields
   */
  private rowToDocument(row: DatabaseRow): OKRDocument {
    return {
      id: row.id,
      objective: row.objective,
      keyResults: JSON.parse(row.key_results) as KeyResult[],
      sourceSessionId: row.source_session_id,
      generatedAt: row.generated_at,
      lastEditedAt: row.last_edited_at,
      regenerationPolicy: row.regeneration_policy as RegenerationPolicy,
      manualEdits: JSON.parse(row.manual_edits) as ManualEditRecord[],
    };
  }

  /**
   * Record a manual edit for an OKR document
   * Appends the edit to the manualEdits array and updates lastEditedAt
   * @param okrId - The OKR document ID
   * @param edit - The manual edit record to add
   * @returns Promise that resolves when recorded
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

      const stmt = database.prepare(`
        UPDATE okr_documents
        SET manual_edits = ?, last_edited_at = ?
        WHERE id = ?
      `);

      stmt.run(JSON.stringify(updatedEdits), lastEditedAt, okrId);

      Logger.debug('[OKRRepository] Recorded edit for OKR:', okrId, 'Edit ID:', edit.id);
    } catch (error) {
      Logger.error('[OKRRepository] Failed to record edit:', error);
      throw new Error(
        `Failed to record edit: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Detect changes between existing and new OKR documents
   * Compares objective and keyResults to generate edit records
   * @param existing - The existing OKR document
   * @param updated - The updated OKR document
   * @returns Array of manual edit records for detected changes
   */
  private detectChanges(existing: OKRDocument, updated: OKRDocument): ManualEditRecord[] {
    const edits: ManualEditRecord[] = [];
    const timestamp = new Date().toISOString();

    // Detect objective changes
    if (existing.objective !== updated.objective) {
      edits.push({
        id: randomUUID(),
        fieldPath: 'objective',
        previousValue: existing.objective,
        newValue: updated.objective,
        editedAt: timestamp,
      });
    }

    // Detect key results changes
    const existingKRs = new Map(existing.keyResults.map(kr => [kr.id, kr]));
    const updatedKRs = new Map(updated.keyResults.map(kr => [kr.id, kr]));

    // Check for modified or added key results
    for (const [id, updatedKR] of updatedKRs) {
      const existingKR = existingKRs.get(id);
      if (!existingKR) {
        // New key result added
        edits.push({
          id: randomUUID(),
          fieldPath: `keyResults[${updated.keyResults.findIndex(kr => kr.id === id)}]`,
          previousValue: '',
          newValue: JSON.stringify(updatedKR),
          editedAt: timestamp,
        });
      } else if (JSON.stringify(existingKR) !== JSON.stringify(updatedKR)) {
        // Key result modified
        edits.push({
          id: randomUUID(),
          fieldPath: `keyResults[${updated.keyResults.findIndex(kr => kr.id === id)}]`,
          previousValue: JSON.stringify(existingKR),
          newValue: JSON.stringify(updatedKR),
          editedAt: timestamp,
        });
      }
    }

    // Check for removed key results
    for (const [id, existingKR] of existingKRs) {
      if (!updatedKRs.has(id)) {
        edits.push({
          id: randomUUID(),
          fieldPath: 'keyResults',
          previousValue: JSON.stringify(existingKR),
          newValue: '',
          editedAt: timestamp,
        });
      }
    }

    return edits;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Database row structure for okr_documents table
 */
interface DatabaseRow {
  id: string;
  objective: string;
  key_results: string;
  source_session_id: string;
  generated_at: string;
  last_edited_at: string | null;
  regeneration_policy: string;
  manual_edits: string;
}

/**
 * Backward-compatible alias for existing code
 * @deprecated Use OKRRepositorySqlite instead
 */
export { OKRRepositorySqlite as OkrRepository };
