import { join } from 'node:path';

import type { UserActionLogEntry } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import { ensureDataDir, readEncryptedJson, writeEncryptedJson } from './encrypted-persistence.js';

const DEFAULT_DATA_DIR = join(process.cwd(), 'data');

export class ActionLogWriter {
  private readonly dataDir: string;
  private readonly actionLogFile: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.actionLogFile = join(this.dataDir, 'action-log.json');
  }

  async append(entry: UserActionLogEntry): Promise<void> {
    await ensureDataDir(this.dataDir);

    try {
      const current = (await readEncryptedJson<UserActionLogEntry[]>(this.actionLogFile)) ?? [];
      current.push(entry);
      await writeEncryptedJson(this.actionLogFile, current);
    } catch (error) {
      Logger.error('[ActionLogWriter] Failed to append action log', error);
      throw error;
    }
  }

  async all(): Promise<UserActionLogEntry[]> {
    await ensureDataDir(this.dataDir);

    try {
      return (await readEncryptedJson<UserActionLogEntry[]>(this.actionLogFile)) ?? [];
    } catch (error) {
      Logger.error('[ActionLogWriter] Failed to read action logs', error);
      return [];
    }
  }
}
