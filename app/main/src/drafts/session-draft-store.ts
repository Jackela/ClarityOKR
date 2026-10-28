import * as nodeFs from 'node:fs';
import { join } from 'node:path';

import {
  DRAFT_FILE_VERSION,
  draftFileSchema,
  draftRowKey,
  type DraftFile,
  type DraftRow,
  type DraftWindow,
} from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';

type Fs = Pick<
  typeof nodeFs,
  'mkdirSync' | 'writeFileSync' | 'renameSync' | 'readFileSync' | 'existsSync' | 'rmSync'
>;

export interface SessionDraftStoreOptions {
  /** `userData/drafts`; `null` in in-memory database mode (no drafts at all, S3§12.1). */
  dir: string | null;
  now?: () => Date;
  fs?: Fs;
}

/** What reading a window's draft file found. */
export type DraftLoad = { kind: 'none' } | { kind: 'corrupt' } | { kind: 'ok'; rows: DraftRow[] };

/**
 * #110: the draft files, one per window (`main.json`, `sticky.json`). Windows report their
 * unsaved input continuously (`report`); only a session end (`writeAll`) puts it on disk, so
 * a normal quit leaves nothing (S3§12.1). Writes are atomic (temp file + rename) and
 * synchronous: the system may end the process right after the `session-end` event.
 */
export class SessionDraftStore {
  private readonly live = new Map<DraftWindow, DraftRow[]>();
  private readonly fs: Fs;
  private readonly now: () => Date;

  constructor(private readonly options: SessionDraftStoreOptions) {
    this.fs = options.fs ?? nodeFs;
    this.now = options.now ?? (() => new Date());
  }

  get enabled(): boolean {
    return this.options.dir !== null;
  }

  fileOf(window: DraftWindow): string | null {
    return this.options.dir === null ? null : join(this.options.dir, `${window}.json`);
  }

  /** The current unsaved input of `window` (replaces what it reported before). */
  report(window: DraftWindow, rows: DraftRow[]): void {
    if (!this.enabled) return;
    if (rows.length === 0) this.live.delete(window);
    else this.live.set(window, rows);
  }

  /** The window went away: what it held is gone with it. */
  forget(window: DraftWindow): void {
    this.live.delete(window);
  }

  /**
   * The session is ending: write each window's unsaved input. Rows of a draft still on disk
   * (not restored / discarded yet) are kept unless the same spot has newer input. Never throws.
   */
  writeAll(): void {
    if (!this.enabled) return;
    for (const [window, rows] of this.live) {
      try {
        const previous = this.load(window);
        const merged = new Map<string, DraftRow>();
        if (previous.kind === 'ok')
          for (const row of previous.rows) merged.set(draftRowKey(row), row);
        for (const row of rows) merged.set(draftRowKey(row), row);
        this.write(window, [...merged.values()]);
      } catch (error) {
        Logger.error('[drafts] Could not save the draft at session end', window, error);
      }
    }
  }

  /** Reads `window`'s draft. A file that does not parse is renamed `.corrupt` and logged. */
  load(window: DraftWindow): DraftLoad {
    const file = this.fileOf(window);
    if (file === null || !this.fs.existsSync(file)) return { kind: 'none' };
    let parsed: DraftFile;
    try {
      parsed = draftFileSchema.parse(JSON.parse(this.fs.readFileSync(file, 'utf8')));
      if (parsed.window !== window) throw new Error(`draft of ${parsed.window} in ${window}.json`);
    } catch (error) {
      Logger.error('[drafts] The draft file cannot be read; kept aside as .corrupt', window, error);
      try {
        this.fs.renameSync(file, `${file}.corrupt`);
      } catch (renameError) {
        Logger.error('[drafts] Could not rename the corrupt draft', renameError);
      }
      return { kind: 'corrupt' };
    }
    return { kind: 'ok', rows: parsed.rows };
  }

  /** Drops rows (by key) or the whole draft of `window`. Returns how many rows are left. */
  settle(window: DraftWindow, drop: { all: true } | { keys: readonly string[] }): number {
    const loaded = this.load(window);
    if (loaded.kind !== 'ok') return 0;
    const keys = 'all' in drop ? null : new Set(drop.keys);
    const left = keys === null ? [] : loaded.rows.filter((row) => !keys.has(draftRowKey(row)));
    this.write(window, left);
    return left.length;
  }

  private write(window: DraftWindow, rows: DraftRow[]): void {
    const file = this.fileOf(window);
    if (file === null) return;
    if (rows.length === 0) {
      this.fs.rmSync(file, { force: true });
      return;
    }
    const content: DraftFile = {
      version: DRAFT_FILE_VERSION,
      window,
      savedAt: this.now().toISOString(),
      rows,
    };
    this.fs.mkdirSync(this.options.dir as string, { recursive: true });
    const tmp = `${file}.tmp`;
    this.fs.writeFileSync(tmp, JSON.stringify(content), 'utf8');
    this.fs.renameSync(tmp, file);
  }
}

/** The part of a `BrowserWindow` the session-end wiring needs. */
export interface SessionEndSource {
  on(event: 'query-session-end' | 'session-end', listener: () => void): unknown;
}

/**
 * #110: ONE session-end handler for the whole app. Windows ends the session (log off / shut
 * down) and Electron emits `query-session-end` / `session-end` on EVERY window; whichever
 * comes first writes the drafts and lets the app quit, exactly once. The shutdown is never
 * prevented or delayed. `attach` is called for each window as it is created.
 */
export function wireSessionEndDrafts(
  drafts: Pick<SessionDraftStore, 'writeAll'>,
  onSessionEnd: () => void,
): { attach: (window: SessionEndSource) => void } {
  let written = false;
  let ended = false;
  const write = (): void => {
    if (written) return;
    written = true;
    drafts.writeAll();
  };
  return {
    attach: (window) => {
      window.on('query-session-end', write);
      window.on('session-end', () => {
        write();
        if (ended) return;
        ended = true;
        onSessionEnd();
      });
    },
  };
}
