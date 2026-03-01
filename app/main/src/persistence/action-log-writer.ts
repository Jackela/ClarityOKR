import { join } from 'node:path';

import type { UserActionLogEntry } from '@clarityokr/contracts';

import { ensureDataDir, readJson, writeJson } from './utils.js';

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
    const current = (await readJson<UserActionLogEntry[]>(this.actionLogFile)) ?? [];
    current.push(entry);
    await writeJson(this.actionLogFile, current);
  }

  async all(): Promise<UserActionLogEntry[]> {
    await ensureDataDir(this.dataDir);
    return (await readJson<UserActionLogEntry[]>(this.actionLogFile)) ?? [];
  }
}
