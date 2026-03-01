import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import type { UserActionLogEntry } from '@clarityokr/contracts';

const DEFAULT_DATA_DIR = join(process.cwd(), 'data');

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
  private readonly dataDir: string;
  private readonly actionLogFile: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.actionLogFile = join(this.dataDir, 'action-log.json');
  }

  private async ensureDataDir(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  async append(entry: UserActionLogEntry): Promise<void> {
    await this.ensureDataDir();
    const current = (await readJson<UserActionLogEntry[]>(this.actionLogFile)) ?? [];
    current.push(entry);
    await writeJson(this.actionLogFile, current);
  }

  async all(): Promise<UserActionLogEntry[]> {
    await this.ensureDataDir();
    return (await readJson<UserActionLogEntry[]>(this.actionLogFile)) ?? [];
  }
}
