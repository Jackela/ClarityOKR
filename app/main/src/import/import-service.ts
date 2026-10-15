import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import {
  IMPORT_MAX_BYTES,
  TEXT_LIMITS,
  checkText,
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
}

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

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** `title（导入）`, shortening the title so the result stays within the objective limit. */
export function copyTitle(title: string): string {
  if (title.endsWith(COPY_SUFFIX)) return title;
  let base = title;
  while (base.length > 0 && !checkText(`${base}${COPY_SUFFIX}`, TEXT_LIMITS.objective).ok) {
    const parts = [...segmenter.segment(base)].map((p) => p.segment);
    parts.pop();
    base = parts.join('');
  }
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

  constructor(private readonly deps: ImportDeps) {
    this.read = deps.readFile ?? ((path) => readFile(path));
    this.size = deps.fileSize ?? (async (path) => (await stat(path)).size);
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

  async commit(token: string, onConflict: ImportConflictChoice): Promise<ImportReply | null> {
    const session = this.session;
    if (!session || session.token !== token) return null;
    const items = session.documents.map(itemOf);
    const conflicts = this.conflictsOf(items);
    const conflicting = new Set(conflicts.map((c) => c.index));
    const toWrite: Array<{ input: ImportObjectiveInput; title: string }> = [];
    const skipped: ImportItem[] = [];
    session.documents.forEach((document, index) => {
      const item = items[index] as ImportItem;
      if (!conflicting.has(index)) toWrite.push({ input: document, title: item.title });
      else if (onConflict === 'copy') toWrite.push({ input: document, title: copyTitle(item.title) });
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
    try {
      const size = await this.size(path);
      if (size > IMPORT_MAX_BYTES) {
        return { outcome: 'rejected', problem: { kind: 'too_large', sizeBytes: size } };
      }
      bytes = await this.read(path);
    } catch (error) {
      const category = categorizeReadError(error);
      Logger.warn('[import] Reading the file failed', { category, retry: isRetry });
      if (isRetry) return { outcome: 'original_missing' };
      return { outcome: 'rejected', problem: { kind: 'read_failed', category } };
    }
    if (bytes.length > IMPORT_MAX_BYTES) {
      return { outcome: 'rejected', problem: { kind: 'too_large', sizeBytes: bytes.length } };
    }
    const parsed = parseImportFile(bytes);
    if (!parsed.ok) return { outcome: 'rejected', problem: parsed.problem };

    const session: Session = { token: randomUUID(), path, documents: [parsed.document] };
    const items = session.documents.map(itemOf);
    const conflicts = this.conflictsOf(items);
    const memory = this.deps.isMemory();
    if (conflicts.length > 0 || memory) {
      this.session = session;
      return { outcome: 'confirm', token: session.token, items, conflicts, memory };
    }
    return this.write(
      session,
      session.documents.map((document, i) => ({ input: document, title: (items[i] as ImportItem).title })),
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
        imported: ids.map((okrId, i) => ({ okrId, title: (toWrite[i] as { title: string }).title })),
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
