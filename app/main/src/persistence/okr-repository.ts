import { join } from 'node:path';

import type { OKRDocument } from '@clarityokr/contracts';

import { ensureDataDir, readJson, writeJson } from './utils.js';

const DATA_DIR = join(process.cwd(), 'data');
const OKR_FILE = join(DATA_DIR, 'okr-document.json');

export class OkrRepository {
  async loadLatest(): Promise<OKRDocument | null> {
    await ensureDataDir(DATA_DIR);
    return readJson<OKRDocument>(OKR_FILE);
  }

  async save(document: OKRDocument): Promise<void> {
    await ensureDataDir(DATA_DIR);
    await writeJson(OKR_FILE, document);
  }
}
