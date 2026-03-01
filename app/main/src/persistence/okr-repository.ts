import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import type { OKRDocument } from '@clarityokr/contracts';

const DEFAULT_DATA_DIR = join(process.cwd(), 'data');

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
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

export class OkrRepository {
  private readonly dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
  }

  private get okrFile(): string {
    return join(this.dataDir, 'okr-document.json');
  }

  async loadLatest(): Promise<OKRDocument | null> {
    await ensureDir(this.dataDir);
    return readJson<OKRDocument>(this.okrFile);
  }

  async save(document: OKRDocument): Promise<void> {
    await ensureDir(this.dataDir);
    await writeJson(this.okrFile, document);
  }
}
