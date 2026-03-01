import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import type { ClarificationSession, OKRDocument, UserActionLogEntry } from '@clarityokr/contracts';

export interface PersistedState {
  session: ClarificationSession | null;
  okr: OKRDocument | null;
  actions: UserActionLogEntry[];
}

async function ensureDataDir(dataDir: string): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
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
  private readonly dataDir: string;
  private readonly sessionFile: string;
  private readonly okrFile: string;
  private readonly actionLogFile: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? join(process.cwd(), 'data');
    this.sessionFile = join(this.dataDir, 'clarification-session.json');
    this.okrFile = join(this.dataDir, 'okr-document.json');
    this.actionLogFile = join(this.dataDir, 'action-log.json');
  }

  async load(): Promise<PersistedState> {
    await ensureDataDir(this.dataDir);

    const [session, okr, actions] = await Promise.all([
      readJson<ClarificationSession>(this.sessionFile),
      readJson<OKRDocument>(this.okrFile),
      readJson<UserActionLogEntry[]>(this.actionLogFile),
    ]);

    return {
      session,
      okr,
      actions: actions ?? [],
    };
  }

  async saveSession(session: ClarificationSession | null): Promise<void> {
    await ensureDataDir(this.dataDir);

    if (session) {
      await writeJson(this.sessionFile, session);
    } else {
      await fs.rm(this.sessionFile, { force: true });
    }
  }

  async saveOKRDocument(document: OKRDocument | null): Promise<void> {
    await ensureDataDir(this.dataDir);

    if (document) {
      await writeJson(this.okrFile, document);
    } else {
      await fs.rm(this.okrFile, { force: true });
    }
  }

  async appendActionLog(entry: UserActionLogEntry): Promise<void> {
    await ensureDataDir(this.dataDir);

    const current = (await readJson<UserActionLogEntry[]>(this.actionLogFile)) ?? [];
    current.push(entry);
    await writeJson(this.actionLogFile, current);
  }

  async replaceActionLog(entries: UserActionLogEntry[]): Promise<void> {
    await ensureDataDir(this.dataDir);
    await writeJson(this.actionLogFile, entries);
  }
}
