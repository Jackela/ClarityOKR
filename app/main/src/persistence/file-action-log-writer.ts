import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { UserActionLogEntry, UserActionType } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import { ensureDataDir, readEncryptedJson, writeEncryptedJson } from './encrypted-persistence.js';
import type { IActionLogWriter } from './action-log-writer.interface.js';

const MAX_PAYLOAD_SUMMARY_LENGTH = 120;
const DEFAULT_DATA_DIR = join(process.cwd(), 'data');

/**
 * File-based implementation of ActionLogWriter using encrypted JSON.
 * @deprecated Use SQLiteActionLogWriter for new code
 */
export class FileActionLogWriter implements IActionLogWriter {
  private readonly dataDir: string;
  private readonly actionLogFile: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.actionLogFile = join(this.dataDir, 'action-log.json');
  }

  async logGenerate(sessionId: string, okrId: string, objective: string): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'generate' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: objective.slice(0, MAX_PAYLOAD_SUMMARY_LENGTH),
      occurredAt: new Date().toISOString(),
    };
    await this.append(entry);
  }

  async logRegenerate(
    sessionId: string,
    okrId: string,
    policy: 'overwrite' | 'append',
  ): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'regenerate' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: `policy:${policy}`,
      occurredAt: new Date().toISOString(),
    };
    await this.append(entry);
  }

  async logEdit(sessionId: string, okrId: string, fieldPath: string): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'edit' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: fieldPath.slice(0, MAX_PAYLOAD_SUMMARY_LENGTH),
      occurredAt: new Date().toISOString(),
    };
    await this.append(entry);
  }

  async logCopy(sessionId: string, okrId: string): Promise<void> {
    const entry: UserActionLogEntry = {
      id: randomUUID(),
      actionType: 'copy' as UserActionType,
      sessionId,
      okrId,
      payloadSummary: 'copied to clipboard',
      occurredAt: new Date().toISOString(),
    };
    await this.append(entry);
  }

  async append(entry: UserActionLogEntry): Promise<void> {
    await ensureDataDir(this.dataDir);
    try {
      const current = (await readEncryptedJson<UserActionLogEntry[]>(this.actionLogFile)) ?? [];
      current.push(entry);
      await writeEncryptedJson(this.actionLogFile, current);
    } catch (error) {
      Logger.error('[FileActionLogWriter] Failed to append action log', error);
      throw error;
    }
  }

  async all(): Promise<UserActionLogEntry[]> {
    await ensureDataDir(this.dataDir);
    try {
      return (await readEncryptedJson<UserActionLogEntry[]>(this.actionLogFile)) ?? [];
    } catch (error) {
      Logger.error('[FileActionLogWriter] Failed to read action logs', error);
      return [];
    }
  }
}

/**
 * Default ActionLogWriter implementation for backward compatibility.
 * @deprecated Use SQLiteActionLogWriter for new code
 */
export { FileActionLogWriter as ActionLogWriter };
