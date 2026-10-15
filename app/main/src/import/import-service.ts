import { randomUUID } from 'node:crypto';
import { open, readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import {
  IMPORT_BACKUP_MAX_BYTES,
  IMPORT_MAX_BYTES,
  TEXT_LIMITS,
  countGraphemes,
  truncateGraphemes,
  type ImportConflict,
  type ImportConflictChoice,
  type ImportItem,
  type ImportReadCategory,
  type ImportReply,
  type ImportWriteCategory,
} from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { ExportJsonDocument } from '../export/export-document.js';
import { errorCode } from '../persistence/okr-store/db-errors.js';
import type { ImportObjectiveInput } from '../persistence/okr-store/okr-store.js';
import { parseImportFile } from './import-document.js';

export interface ImportDeps {
  /** System open dialog (`.json`, Downloads); resolves to the chosen path or null. */
  showOpenDialog: () => Promise<string | null>;
  /** Title + creation time of every OKR already in the history. */
  listExisting: () => ReadonlyArray<{ title: string; createdAt: string }>;
  /** Writes all items in one transaction; returns the new ids in order. */
  write: (items: ReadonlyArray<{ input: ImportObjectiveInput; title: string }>) => string[];
  /** The app runs on the in-memory database (Q8-6): always confirm first. */
  isMemory: () => boolean;
  readFile?: (path: string) => Promise<Buffer>;
  fileSize?: (path: string) => Promise<number>;
  /** The first `bytes` of the file (B5: tells a backup apart before reading it all). */
  readHead?: (path: string, bytes: number) => Promise<Buffer>;
}

/** How much of the file start is read to spot `"kind": "backup"`. */
export const IMPORT_HEAD_BYTES = 4096;
const BACKUP_KIND = /"kind"\s*:\s*"backup"/;

const tooLarge = (sizeBytes: number, backup: boolean): ImportReply => ({
  outcome: 'rejected',
  problem: {
    kind: 'too_large',
    sizeBytes,
    limitBytes: backup ? IMPORT_BACKUP_MAX_BYTES : IMPORT_MAX_BYTES,
    backup,
  },
});

/** Suffix of a copy's title (Q8-5: never added twice). */
export const COPY_SUFFIX = '（导入）';

const READ_CATEGORIES = new Map<string, ImportReadCategory>([
  ['EACCES', 'permission'],
  ['EPERM', 'permission'],
  ['ENOENT', 'not_found'],
  ['ENOTDIR', 'not_found'],
  ['EBUSY', 'busy'],
]);

export function categorizeReadError(error: unknown): ImportReadCategory {
  return READ_CATEGORIES.get(errorCode(error)) ?? 'other';
}

export function categorizeWriteError(error: unknown): ImportWriteCategory {
  const code = errorCode(error);
  if (code === 'SQLITE_FULL' || code === 'ENOSPC') return 'disk_full';
  if (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED')) return 'busy';
  return 'other';
}

/** `title（导入）`, shortening the title so the result stays within the objective limit. */
export function copyTitle(title: string): string {
  if (title.endsWith(COPY_SUFFIX)) return title;
  const room = TEXT_LIMITS.objective - countGraphemes(COPY_SUFFIX);
  // truncateGraphemes appends 「…」 when it cuts; drop it, the suffix follows directly
  const base = countGraphemes(title) <= room ? title : truncateGraphemes(title, room).slice(0, -1);
  return `${base}${COPY_SUFFIX}`;
}

const keyOf = (item: ImportItem): string => `${item.createdAt}\u0000${item.title}`;

interface Session {
  token: string;
  path: string;
  documents: ExportJsonDocument[];
}

/**
 * The import flow of S1§8. The chosen path never leaves the main process: it stays behind a
 * one-time token until the dialog is closed (`discard`), the import succeeds, or a newer
 * import starts. A failed write keeps the token so `retry` can re-read the same file (Q8-3).
 */
export class ImportService {
  private session: Session | null = null;
  private readonly read: (path: string) => Promise<Buffer>;
  private readonly size: (path: string) => Promise<number>;
  private readonly head: (path: string, bytes: number) => Promise<Buffer>;

  constructor(private readonly deps: ImportDeps) {
    this.read = deps.readFile ?? ((path) => readFile(path));
    this.size = deps.fileSize ?? (async (path) => (await stat(path)).size);
    this.head = deps.readHead ?? readHead;
  }

  async pick(): Promise<ImportReply> {
    this.session = null;
    let path: string | null;
    try {
      path = await this.deps.showOpenDialog();
    } catch (error) {
      Logger.error('[import] Open dialog failed', { category: categorizeReadError(error) });
      return { outcome: 'rejected', problem: { kind: 'read_failed', category: 'other' } };
    }
    if (!path) return { outcome: 'cancelled' };
    if (!isAbsolute(path)) {
      return { outcome: 'rejected', problem: { kind: 'read_failed', category: 'other' } };
    }
    return this.load(path, false);
  }

  /** Q8-3: same file again. A file that cannot be read any more ends the session. */
  async retry(token: string): Promise<ImportReply | null> {
    const session = this.take(token);
    if (!session) return null;
    return this.load(session.path, true);
  }

  async commit(
    token: string,
    onConflict: ImportConflictChoice,
    choices: Record<string, ImportConflictChoice> = {},
  ): Promise<ImportReply | null> {
    const session = this.session;
    if (!session || session.token !== token) return null;
    const items = session.documents.map(itemOf);
    const conflicts = this.conflictsOf(items);
    const conflicting = new Set(conflicts.map((c) => c.index));
    const toWrite: Array<{ input: ImportObjectiveInput; title: string }> = [];
    const skipped: ImportItem[] = [];
    session.documents.forEach((document, index) => {
      const item = items[index] as ImportItem;
      const choice = choices[String(index)] ?? onConflict; // #50: per item, default from onConflict
      if (!conflicting.has(index)) toWrite.push({ input: document, title: item.title });
      else if (choice === 'copy') toWrite.push({ input: document, title: copyTitle(item.title) });
      else skipped.push(item);
    });
    return this.write(session, toWrite, skipped);
  }

  discard(token: string): boolean {
    return this.take(token) !== null;
  }

  /** True while a token is alive (tests). */
  hasSession(): boolean {
    return this.session !== null;
  }

  private take(token: string): Session | null {
    const session = this.session;
    if (!session || session.token !== token) return null;
    this.session = null;
    return session;
  }

  private async load(path: string, isRetry: boolean): Promise<ImportReply> {
    let bytes: Buffer;
    // B5: a single OKR may be 5 MB, a backup 50 MB. The file start usually says which it is
    // (`"kind": "backup"` comes first in our exports); when it doesn't, the file is read with the
    // backup limit and a single OKR over 5 MB is rejected after parsing.
    let knownBackup = false;
    try {
      const size = await this.size(path);
      if (size > IMPORT_BACKUP_MAX_BYTES) return tooLarge(size, true);
      if (size > IMPORT_MAX_BYTES) {
        knownBackup = BACKUP_KIND.test((await this.head(path, IMPORT_HEAD_BYTES)).toString('utf8'));
      }
      bytes = await this.read(path);
    } catch (error) {
      const category = categorizeReadError(error);
      Logger.warn('[import] Reading the file failed', { category, retry: isRetry });
      if (isRetry) return { outcome: 'original_missing' };
      return { outcome: 'rejected', problem: { kind: 'read_failed', category } };
    }
    if (bytes.length > IMPORT_BACKUP_MAX_BYTES) return tooLarge(bytes.length, true);
    const parsed = parseImportFile(bytes);
    if (bytes.length > IMPORT_MAX_BYTES && !(parsed.ok && parsed.backup)) {
      return tooLarge(bytes.length, false);
    }
    if (knownBackup) Logger.info('[import] Large backup recognised from the file start');
    if (!parsed.ok) return { outcome: 'rejected', problem: parsed.problem };

    const session: Session = { token: randomUUID(), path, documents: parsed.documents };
    const items = session.documents.map(itemOf);
    const conflicts = this.conflictsOf(items);
    const memory = this.deps.isMemory();
    // A backup is always previewed (S1§9.4); a single OKR only when something needs an answer.
    if (conflicts.length > 0 || memory || parsed.backup) {
      this.session = session;
      return {
        outcome: 'confirm',
        token: session.token,
        items,
        conflicts,
        memory,
        ...(parsed.backup ? { backup: parsed.backup } : {}),
      };
    }
    return this.write(
      session,
      session.documents.map((document, i) => ({
        input: document,
        title: (items[i] as ImportItem).title,
      })),
      [],
    );
  }

  private conflictsOf(items: ImportItem[]): ImportConflict[] {
    const existing = new Set(this.deps.listExisting().map(keyOf));
    const inFile = new Set<string>();
    const conflicts: ImportConflict[] = [];
    items.forEach((item, index) => {
      const key = keyOf(item);
      if (existing.has(key)) conflicts.push({ ...item, index, source: 'existing' });
      else if (inFile.has(key)) conflicts.push({ ...item, index, source: 'in_file' });
      inFile.add(key);
    });
    return conflicts;
  }

  private write(
    session: Session,
    toWrite: Array<{ input: ImportObjectiveInput; title: string }>,
    skipped: ImportItem[],
  ): ImportReply {
    const memory = this.deps.isMemory();
    try {
      const ids = toWrite.length > 0 ? this.deps.write(toWrite) : [];
      this.session = null;
      return {
        outcome: 'imported',
        imported: ids.map((okrId, i) => ({
          okrId,
          title: (toWrite[i] as { title: string }).title,
        })),
        skipped,
        memory,
      };
    } catch (error) {
      const category = categorizeWriteError(error);
      Logger.error('[import] Writing failed, transaction rolled back', { category });
      this.session = session;
      return { outcome: 'write_failed', category, token: session.token };
    }
  }
}

function itemOf(document: ExportJsonDocument): ImportItem {
  return { title: document.objective.title, createdAt: document.objective.createdAt };
}

async function readHead(path: string, bytes: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
