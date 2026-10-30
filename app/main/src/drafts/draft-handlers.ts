import {
  IPC_CHANNELS,
  draftReportSchema,
  draftSettleSchema,
  filterDraftRows,
  ipcFail,
  ipcOk,
  sortDraftRows,
  draftRowKey,
  type DraftGetReply,
  type DraftRow,
  type DraftSettleReply,
  type DraftTargetState,
  type DraftWindow,
  type IpcResult,
  type ResolvedDraftRow,
} from '@clarityokr/contracts';
import type { IpcMain } from 'electron';

import { Logger } from '../core/logger.js';
import type { OkrStore } from '../persistence/okr-store/okr-store.js';
import type { SessionDraftStore } from './session-draft-store.js';

export interface DraftHandlerDeps {
  drafts: SessionDraftStore;
  store: Pick<OkrStore, 'getObjective' | 'getReview'>;
  /** Which window an IPC sender is (`null`: neither, e.g. a closed one). */
  windowOf: (senderId: number) => DraftWindow | null;
}

interface Sender {
  sender: { id: number };
}

function liveKrs(store: DraftHandlerDeps['store'], okrId: string) {
  const objective = store.getObjective(okrId);
  if (!objective) return null;
  return { objective, krs: objective.keyResults.filter((kr) => kr.removedAt === null) };
}

/** Where a row would go back to: still there? unchanged since the draft? (S3§12.4 / §12.3) */
export function targetState(store: DraftHandlerDeps['store'], row: DraftRow): DraftTargetState {
  if (row.kind === 'wizard') return { exists: true, unchangedSinceDraft: true };
  const found = liveKrs(store, row.okrId);
  if (!found) return { exists: false };
  if (row.kind === 'objective') {
    return { exists: true, unchangedSinceDraft: found.objective.title === row.base };
  }
  if (row.kind === 'addedKr') {
    // Saved since the draft: the added key results are in the OKR now (#117 rule 1).
    const saved = new Set(found.objective.keyResults.map((kr) => kr.id));
    return { exists: true, unchangedSinceDraft: !row.krs.some((kr) => saved.has(kr.id)) };
  }
  if (row.kind === 'textEdit') {
    const kr = found.krs.find((k) => k.id === row.krId);
    if (!kr) return { exists: false };
    const saved = { statement: kr.statement, successMetric: kr.successMetric ?? '' };
    return {
      exists: true,
      unchangedSinceDraft:
        saved.statement === row.base.statement && saved.successMetric === row.base.successMetric,
    };
  }
  const review = store.getReview(row.okrId);
  const saved = review
    ? { wentWell: review.wentWell, fellShort: review.fellShort, nextSteps: review.nextSteps }
    : { wentWell: '', fellShort: '', nextSteps: '' };
  return {
    exists: true,
    unchangedSinceDraft:
      saved.wentWell === row.base.wentWell &&
      saved.fellShort === row.base.fellShort &&
      saved.nextSteps === row.base.nextSteps,
  };
}

function resolve(store: DraftHandlerDeps['store'], row: DraftRow): ResolvedDraftRow {
  const key = draftRowKey(row);
  if (row.kind === 'wizard') return { key, row };
  const found = liveKrs(store, row.okrId);
  if (!found) throw new Error('resolve() is only called for rows whose OKR exists');
  if (row.kind === 'objective' || row.kind === 'addedKr') {
    return { key, row, okrTitle: found.objective.title };
  }
  if (row.kind === 'textEdit') {
    return {
      key,
      row,
      okrTitle: found.objective.title,
      krIndex: found.krs.findIndex((k) => k.id === row.krId) + 1,
    };
  }
  return { key, row, okrTitle: found.objective.title, period: found.objective.period };
}

/**
 * #110 channels: `app:report-draft` (the window's unsaved input, in memory), `app:draft-get`
 * (the draft this window left; gone / already-saved rows dropped from the file) and
 * `app:draft-settle` (rows restored, voided or discarded). In in-memory database mode
 * every reply is empty and nothing is kept.
 */
export function registerDraftHandlers(ipcMain: Pick<IpcMain, 'handle'>, deps: DraftHandlerDeps) {
  ipcMain.handle(
    IPC_CHANNELS.APP_REPORT_DRAFT,
    (event, payload: unknown): IpcResult<{ recorded: boolean }> => {
      const parsed = draftReportSchema.safeParse(payload);
      if (!parsed.success) return ipcFail('INVALID_REQUEST', 'Invalid draft report');
      const window = deps.windowOf((event as Sender).sender.id);
      if (window === null || !deps.drafts.enabled) return ipcOk({ recorded: false });
      deps.drafts.report(window, parsed.data.rows);
      return ipcOk({ recorded: true });
    },
  );

  ipcMain.handle(IPC_CHANNELS.APP_DRAFT_GET, (event): IpcResult<DraftGetReply> => {
    const window = deps.windowOf((event as Sender).sender.id);
    const empty = ipcOk<DraftGetReply>({ rows: [], deletedCount: 0 });
    if (window === null || !deps.drafts.enabled) return empty;
    try {
      const loaded = deps.drafts.load(window);
      if (loaded.kind !== 'ok') return empty;
      const { valid, deletedCount, voidedCount } = filterDraftRows(loaded.rows, (row) =>
        targetState(deps.store, row),
      );
      if (deletedCount > 0 || voidedCount > 0) {
        Logger.info('[drafts] Rows dropped at launch', { window, deletedCount, voidedCount });
        const keep = new Set(valid.map(draftRowKey));
        deps.drafts.settle(window, {
          keys: loaded.rows.map(draftRowKey).filter((key) => !keep.has(key)),
        });
      }
      // S3§12.4: every row gone → no bar, the draft is cleared silently.
      if (valid.length === 0) return empty;
      return ipcOk({
        rows: sortDraftRows(valid.map((row) => resolve(deps.store, row))),
        deletedCount,
      });
    } catch (error) {
      Logger.error('[drafts] Could not read the draft', error);
      return empty;
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.APP_DRAFT_SETTLE,
    (event, payload: unknown): IpcResult<DraftSettleReply> => {
      const parsed = draftSettleSchema.safeParse(payload);
      if (!parsed.success || (!parsed.data.all && !parsed.data.keys)) {
        return ipcFail('INVALID_REQUEST', 'Invalid draft settle request');
      }
      const window = deps.windowOf((event as Sender).sender.id);
      if (window === null || !deps.drafts.enabled) return ipcOk({ remaining: 0 });
      try {
        const remaining = parsed.data.all
          ? deps.drafts.settle(window, { all: true })
          : deps.drafts.settle(window, { keys: parsed.data.keys ?? [] });
        return ipcOk({ remaining });
      } catch (error) {
        Logger.error('[drafts] Could not update the draft', error);
        return ipcFail('INTERNAL', 'Something went wrong');
      }
    },
  );
}
