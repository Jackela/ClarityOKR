import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ClarificationSession, OKRDocument, UserActionLogEntry } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import { DatabaseService } from './database.service.js';
import { readJson } from './utils.js';

export interface MultiSessionState {
  sessions: Record<string, ClarificationSession>;
  okrs: Record<string, OKRDocument>;
  actions: Record<string, UserActionLogEntry[]>;
  activeSessionId: string | null;
}

export interface MigrationResult {
  success: boolean;
  sessionsMigrated: number;
  okrsMigrated: number;
  actionsMigrated: number;
  errors: string[];
}

export class MigrationService {
  private readonly db: DatabaseService;
  private readonly dataDir: string;
  private readonly jsonFiles: {
    multiSession: string;
    session: string;
    okr: string;
    actionLog: string;
  };

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? join(process.cwd(), 'data');
    this.db = new DatabaseService({ dataDir: this.dataDir });
    this.jsonFiles = {
      multiSession: join(this.dataDir, 'multi-sessions.json'),
      session: join(this.dataDir, 'clarification-session.json'),
      okr: join(this.dataDir, 'okr-document.json'),
      actionLog: join(this.dataDir, 'action-log.json'),
    };
  }

  /**
   * Check if migration is needed (JSON files exist but no migration recorded)
   */
  needsMigration(): boolean {
    const hasJsonFiles =
      existsSync(this.jsonFiles.multiSession) || existsSync(this.jsonFiles.session);

    // Check if migration already done
    try {
      this.db.initialize();
      const alreadyMigrated = this.db.hasMigration('json-to-sqlite-v1');
      return hasJsonFiles && !alreadyMigrated;
    } catch {
      return hasJsonFiles;
    }
  }

  /**
   * Perform migration from JSON files to SQLite
   */
  async migrate(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      sessionsMigrated: 0,
      okrsMigrated: 0,
      actionsMigrated: 0,
      errors: [],
    };

    Logger.info('[MigrationService] Starting migration from JSON to SQLite');

    try {
      this.db.initialize();

      // Check if already migrated
      if (this.db.hasMigration('json-to-sqlite-v1')) {
        Logger.info('[MigrationService] Migration already completed');
        return result;
      }

      // Migrate multi-session data first
      if (existsSync(this.jsonFiles.multiSession)) {
        await this.migrateMultiSessionData(result);
      }

      // Migrate legacy single-session data if no multi-session data
      if (result.sessionsMigrated === 0 && existsSync(this.jsonFiles.session)) {
        await this.migrateLegacyData(result);
      }

      // Record migration
      this.db.recordMigration('json-to-sqlite-v1', 'json-files');

      Logger.info('[MigrationService] Migration completed', {
        sessions: result.sessionsMigrated,
        okrs: result.okrsMigrated,
        actions: result.actionsMigrated,
      });
    } catch (error) {
      result.success = false;
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMsg);
      Logger.error('[MigrationService] Migration failed:', error);
    }

    return result;
  }

  /**
   * Migrate multi-session JSON data
   */
  private async migrateMultiSessionData(result: MigrationResult): Promise<void> {
    const data = await readJson<MultiSessionState>(this.jsonFiles.multiSession);

    if (!data) {
      Logger.warn('[MigrationService] No multi-session data found');
      return;
    }

    // Migrate sessions
    for (const session of Object.values(data.sessions)) {
      try {
        this.db.saveSession(session);
        result.sessionsMigrated++;
      } catch (error) {
        const errorMsg = `Failed to migrate session ${session.id}: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        Logger.error('[MigrationService]', errorMsg);
      }
    }

    // Migrate OKRs
    for (const okr of Object.values(data.okrs)) {
      try {
        this.db.saveOKR(okr);
        result.okrsMigrated++;
      } catch (error) {
        const errorMsg = `Failed to migrate OKR ${okr.id}: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        Logger.error('[MigrationService]', errorMsg);
      }
    }

    // Migrate action logs
    for (const entries of Object.values(data.actions)) {
      for (const entry of entries) {
        try {
          this.db.saveActionLog(entry);
          result.actionsMigrated++;
        } catch (error) {
          const errorMsg = `Failed to migrate action ${entry.id}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
          Logger.error('[MigrationService]', errorMsg);
        }
      }
    }
  }

  /**
   * Migrate legacy single-session JSON data
   */
  private async migrateLegacyData(result: MigrationResult): Promise<void> {
    Logger.info('[MigrationService] Migrating legacy single-session data');

    const session = await readJson<ClarificationSession>(this.jsonFiles.session);
    const okr = await readJson<OKRDocument>(this.jsonFiles.okr);
    const actions = await readJson<UserActionLogEntry[]>(this.jsonFiles.actionLog);

    if (session) {
      try {
        this.db.saveSession(session);
        result.sessionsMigrated++;
        Logger.info('[MigrationService] Migrated legacy session:', session.id);
      } catch (error) {
        const errorMsg = `Failed to migrate legacy session: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        Logger.error('[MigrationService]', errorMsg);
      }
    }

    if (okr) {
      try {
        this.db.saveOKR(okr);
        result.okrsMigrated++;
        Logger.info('[MigrationService] Migrated legacy OKR:', okr.id);
      } catch (error) {
        const errorMsg = `Failed to migrate legacy OKR: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        Logger.error('[MigrationService]', errorMsg);
      }
    }

    if (actions) {
      for (const entry of actions) {
        try {
          this.db.saveActionLog(entry);
          result.actionsMigrated++;
        } catch (error) {
          const errorMsg = `Failed to migrate legacy action ${entry.id}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
          Logger.error('[MigrationService]', errorMsg);
        }
      }
    }
  }

  /**
   * Get migration status
   */
  getMigrationStatus(): { migrated: boolean; version?: string; migratedAt?: string } {
    try {
      this.db.initialize();
      const db = this.db.getDb();
      const row = db
        .prepare(
          `
        SELECT version, migrated_at FROM migrations 
        ORDER BY migrated_at DESC LIMIT 1
      `,
        )
        .get() as { version: string; migrated_at: string } | undefined;

      return {
        migrated: !!row,
        version: row?.version,
        migratedAt: row?.migrated_at,
      };
    } catch {
      return { migrated: false };
    }
  }
}
