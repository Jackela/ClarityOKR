import { join } from 'node:path';

import type { ClarificationSession, OKRDocument, UserActionLogEntry } from '@clarityokr/contracts';

import { ensureDataDir, readJson, writeJson } from './utils.js';

const DATA_DIR = join(process.cwd(), 'data');
const SESSION_FILE = join(DATA_DIR, 'clarification-session.json');
const OKR_FILE = join(DATA_DIR, 'okr-document.json');
const ACTION_LOG_FILE = join(DATA_DIR, 'action-log.json');

export interface PersistedState {
  session: ClarificationSession | null;
  okr: OKRDocument | null;
  actions: UserActionLogEntry[];
}

export class SessionRepository {
  async load(): Promise<PersistedState> {
    await ensureDataDir(DATA_DIR);

    const [session, okr, actions] = await Promise.all([
      readJson<ClarificationSession>(SESSION_FILE),
      readJson<OKRDocument>(OKR_FILE),
      readJson<UserActionLogEntry[]>(ACTION_LOG_FILE),
    ]);

    return {
      session,
      okr,
      actions: actions ?? [],
    };
  }

  async saveSession(session: ClarificationSession | null): Promise<void> {
    await ensureDataDir(DATA_DIR);

    if (session) {
      await writeJson(SESSION_FILE, session);
    } else {
      const { promises: fs } = await import('node:fs');
      await fs.rm(SESSION_FILE, { force: true });
    }
  }

  async saveOKRDocument(document: OKRDocument | null): Promise<void> {
    await ensureDataDir(DATA_DIR);

    if (document) {
      await writeJson(OKR_FILE, document);
    } else {
      const { promises: fs } = await import('node:fs');
      await fs.rm(OKR_FILE, { force: true });
    }
  }

  async appendActionLog(entry: UserActionLogEntry): Promise<void> {
    await ensureDataDir(DATA_DIR);

    const current = (await readJson<UserActionLogEntry[]>(ACTION_LOG_FILE)) ?? [];
    current.push(entry);
    await writeJson(ACTION_LOG_FILE, current);
  }

  async replaceActionLog(entries: UserActionLogEntry[]): Promise<void> {
    await ensureDataDir(DATA_DIR);
    await writeJson(ACTION_LOG_FILE, entries);
  }
}
