import { randomBytes } from 'node:crypto';
import { lstat, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, basename } from 'node:path';

import type { ExportFailureCategory, ExportFormat, ExportReply } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import { buildExportFileName } from './export-file-name.js';
import { renderJson, renderMarkdown, type ExportSource } from './export-document.js';

export interface SaveDialogRequest {
  /** Downloads directory + the suggested file name. */
  defaultPath: string;
  format: ExportFormat;
}

export interface ExportDeps {
  /** Reads everything the export needs; returns null for an unknown id. */
  loadSource: (okrId: string) => ExportSource | null;
  /** Shows the system save dialog; resolves to the chosen path or null when cancelled. */
  showSaveDialog: (request: SaveDialogRequest) => Promise<string | null>;
  /** Opens the file manager with the file selected. */
  showItemInFolder: (path: string) => void;
  /** Default directory of the save dialog (the user's Downloads folder). */
  getDownloadsDir: () => string;
  /** Writes the file atomically; the default writes a temp file next to it and renames. */
  writeFile?: (path: string, content: string) => Promise<void>;
  now?: () => Date;
}

/** `null` when the OKR does not exist. */
export type ExportOutcome = ExportReply | null;

const EXPORT_ERROR_CATEGORIES = new Map<string, ExportFailureCategory>([
  ['EACCES', 'permission'],
  ['EPERM', 'permission'],
  ['ENOSPC', 'disk_full'],
  ['ENOENT', 'not_found'],
  ['EBUSY', 'busy'],
  ['EEXIST', 'exists'],
]);

export function categorizeExportError(error: unknown): ExportFailureCategory {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  return EXPORT_ERROR_CATEGORIES.get(code) ?? 'other';
}

/** Longest part of the original name kept in the temp file name (the rest is dot, hex, `.tmp`). */
const TEMP_NAME_BASE_MAX_BYTES = 200;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function truncateToBytes(text: string, maxBytes: number): string {
  let result = '';
  for (const { segment } of segmenter.segment(text)) {
    if (Buffer.byteLength(result + segment, 'utf8') > maxBytes) break;
    result += segment;
  }
  return result;
}

/** Hidden sibling of `path`; stays well below the 255-byte file name limit. */
export function tempFilePathFor(path: string): string {
  const base = truncateToBytes(basename(path), TEMP_NAME_BASE_MAX_BYTES);
  return join(dirname(path), `.${base}.${randomBytes(6).toString('hex')}.tmp`);
}

/** Temp file + rename: a failed write never leaves a truncated file at the chosen path. */
export async function writeFileAtomically(path: string, content: string): Promise<void> {
  const temp = tempFilePathFor(path);
  try {
    await writeFile(temp, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/** Keeps the extension the user picked only when it matches the chosen format. */
function withFormatExtension(path: string, format: ExportFormat): string {
  return extname(path).toLowerCase() === `.${format}` ? path : `${path}.${format}`;
}

/**
 * Exports one OKR as Markdown or JSON. The save location comes from an injected dialog;
 * the only path ever handed to the renderer is the one of a file that was just written, and
 * that same path is the only one `reveal` accepts.
 */
export class ExportService {
  private lastExportedPath: string | null = null;
  private readonly writeOut: (path: string, content: string) => Promise<void>;
  private readonly now: () => Date;

  constructor(private readonly deps: ExportDeps) {
    this.writeOut = deps.writeFile ?? writeFileAtomically;
    this.now = deps.now ?? (() => new Date());
  }

  async export(okrId: string, format: ExportFormat): Promise<ExportOutcome> {
    // A new attempt invalidates the previous reveal permission, whatever the outcome.
    this.lastExportedPath = null;
    const source = this.deps.loadSource(okrId);
    if (!source) {
      return null;
    }
    const exportedAt = this.now();
    const fileName = buildExportFileName(source.objective.title, exportedAt, format);

    let chosen: string | null;
    try {
      chosen = await this.deps.showSaveDialog({
        defaultPath: join(this.deps.getDownloadsDir(), fileName),
        format,
      });
    } catch (error) {
      Logger.error('[export] Save dialog failed', {
        format,
        category: categorizeExportError(error),
      });
      return { outcome: 'failed', category: 'other' };
    }
    if (chosen === null || chosen === undefined || chosen === '') {
      return { outcome: 'cancelled' };
    }
    if (!isAbsolute(chosen)) {
      Logger.error('[export] Save dialog returned a relative path; refusing to write');
      return { outcome: 'failed', category: 'other' };
    }

    const path = withFormatExtension(chosen, format);
    const content = format === 'json' ? renderJson(source, exportedAt) : renderMarkdown(source);
    try {
      // The OS dialog only confirmed an overwrite of the exact path it returned. When we
      // appended an extension the final name is new to it, so an existing file there must
      // never be replaced silently.
      if (path !== chosen && (await pathExists(path))) {
        Logger.warn('[export] Extension-adjusted target already exists; not overwriting', {
          format,
        });
        return { outcome: 'failed', category: 'exists' };
      }
      await this.writeOut(path, content);
    } catch (error) {
      const category = categorizeExportError(error);
      // The path is deliberately not logged; the error code is enough to diagnose.
      Logger.error('[export] Writing the export file failed', { format, category });
      return { outcome: 'failed', category };
    }
    this.lastExportedPath = path;
    return { outcome: 'saved', format, fileName: basename(path), path };
  }

  /**
   * The Markdown of an OKR (the same text as the `.md` file) for the clipboard; `null` for an
   * unknown id. Never touches the reveal permission.
   */
  renderMarkdownFor(okrId: string): string | null {
    const source = this.deps.loadSource(okrId);
    return source ? renderMarkdown(source) : null;
  }

  /** True only for the path returned by the most recent successful export. */
  canReveal(path: string): boolean {
    return this.lastExportedPath !== null && path === this.lastExportedPath;
  }

  reveal(path: string): boolean {
    if (!this.canReveal(path)) {
      return false;
    }
    this.deps.showItemInFolder(path);
    return true;
  }
}
