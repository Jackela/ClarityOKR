import { join } from 'node:path';

import type { UserActionLogEntry } from '@clarityokr/contracts';

import { ensureDataDir, readJson, writeJson } from './utils.js';

const DATA_DIR = join(process.cwd(), 'data');
const ACTION_LOG_FILE = join(DATA_DIR, 'action-log.json');

export class ActionLogWriter {
  async append(entry: UserActionLogEntry): Promise<void> {
    await ensureDataDir(DATA_DIR);
    const current = (await readJson<UserActionLogEntry[]>(ACTION_LOG_FILE)) ?? [];
    current.push(entry);
    await writeJson(ACTION_LOG_FILE, current);
  }

  async all(): Promise<UserActionLogEntry[]> {
    await ensureDataDir(DATA_DIR);
    return (await readJson<UserActionLogEntry[]>(ACTION_LOG_FILE)) ?? [];
  }
}
