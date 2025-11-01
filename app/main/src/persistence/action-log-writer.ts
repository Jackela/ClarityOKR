import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import type { UserActionLogEntry } from '@clarityokr/contracts';

const DATA_DIR = join(process.cwd(), 'data');
const ACTION_LOG_FILE = join(DATA_DIR, 'action-log.json');

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    if (!raw.trim()) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

async function writeJson<T>(file: string, value: T): Promise<void> {
  const payload = JSON.stringify(value, null, 2);
  await fs.writeFile(file, payload, 'utf-8');
}

export class ActionLogWriter {
  async append(entry: UserActionLogEntry): Promise<void> {
    await ensureDataDir();
    const current = (await readJson<UserActionLogEntry[]>(ACTION_LOG_FILE)) ?? [];
    current.push(entry);
    await writeJson(ACTION_LOG_FILE, current);
  }

  async all(): Promise<UserActionLogEntry[]> {
    await ensureDataDir();
    return (await readJson<UserActionLogEntry[]>(ACTION_LOG_FILE)) ?? [];
  }
}
