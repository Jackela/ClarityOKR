import { join } from 'node:path';

import type { OKRDocument } from '@clarityokr/contracts';

import { ensureDataDir, readJson, writeJson } from './utils.js';

const DEFAULT_DATA_DIR = join(process.cwd(), 'data');

export class OkrRepository {
  private readonly dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
  }

  private get okrFile(): string {
    return join(this.dataDir, 'okr-document.json');
  }

  async loadLatest(): Promise<OKRDocument | null> {
    await ensureDataDir(this.dataDir);
    return readJson<OKRDocument>(this.okrFile);
  }

  async save(document: OKRDocument): Promise<void> {
    await ensureDataDir(this.dataDir);
    await writeJson(this.okrFile, document);
  }
}
