import { join } from 'node:path';

import type { OKRDocument } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import { ensureDataDir, readEncryptedJson, writeEncryptedJson } from './encrypted-persistence.js';

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

    try {
      return await readEncryptedJson<OKRDocument>(this.okrFile);
    } catch (error) {
      Logger.error('[OkrRepository] Failed to load latest OKR', error);
      return null;
    }
  }

  async save(document: OKRDocument): Promise<void> {
    await ensureDataDir(this.dataDir);

    try {
      await writeEncryptedJson(this.okrFile, document);
    } catch (error) {
      Logger.error('[OkrRepository] Failed to save OKR document', error);
      throw error;
    }
  }
}
