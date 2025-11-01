import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import type {
  ClarificationSession,
  OKRDocument,
  UserActionLogEntry
} from '@clarityokr/contracts';

const DATA_DIR = join(process.cwd(), 'data');
const SESSION_FILE = join(DATA_DIR, 'clarification-session.json');
const OKR_FILE = join(DATA_DIR, 'okr-document.json');
const ACTION_LOG_FILE = join(DATA_DIR, 'action-log.json');

export interface PersistedState {
  session: ClarificationSession | null;
  okr: OKRDocument | null;
  actions: UserActionLogEntry[];
}

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

export class SessionRepository {
  async load(): Promise<PersistedState> {
    await ensureDataDir();

    const [session, okr, actions] = await Promise.all([
      readJson<ClarificationSession>(SESSION_FILE),
      readJson<OKRDocument>(OKR_FILE),
      readJson<UserActionLogEntry[]>(ACTION_LOG_FILE)
    ]);

    return {
      session,
      okr,
      actions: actions ?? []
    };
  }

  async saveSession(session: ClarificationSession | null): Promise<void> {
    await ensureDataDir();

    if (session) {
      await writeJson(SESSION_FILE, session);
    } else {
      await fs.rm(SESSION_FILE, { force: true });
    }
  }

  async saveOKRDocument(document: OKRDocument | null): Promise<void> {
    await ensureDataDir();

    if (document) {
      await writeJson(OKR_FILE, document);
    } else {
      await fs.rm(OKR_FILE, { force: true });
    }
  }

  async appendActionLog(entry: UserActionLogEntry): Promise<void> {
    await ensureDataDir();

    const current = (await readJson<UserActionLogEntry[]>(ACTION_LOG_FILE)) ?? [];
    current.push(entry);
    await writeJson(ACTION_LOG_FILE, current);
  }

  async replaceActionLog(entries: UserActionLogEntry[]): Promise<void> {
    await ensureDataDir();
    await writeJson(ACTION_LOG_FILE, entries);
  }
}
