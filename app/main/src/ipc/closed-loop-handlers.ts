import {
  IPC_CHANNELS,
  ValidationError,
  ipcFail,
  ipcOk,
  parseExportRequest,
  parseKrIdRequest,
  parseOkrIdRequest,
  parseReplaceProgressRequest,
  parseRevealRequest,
  parseSaveReviewRequest,
  parseSetPeriodRequest,
  parseSetProgressRequest,
  type IpcResult,
  type KeyResultRecord,
  type KrProgressInfo,
  type CopyReply,
  type OkrDetail,
  type OkrListReply,
  type Parsed,
  type PinReply,
  type ProgressChangeReply,
  type ReviewReply,
  type SetPeriodReply,
} from '@clarityokr/contracts';
import type { Clipboard, IpcMain } from 'electron';

import { Logger } from '../core/logger.js';
import type { ExportService } from '../export/export-service.js';
import type { OkrStore } from '../persistence/okr-store/okr-store.js';

export interface ClosedLoopHandlerDeps {
  store: OkrStore;
  exportService: ExportService;
  /** The system clipboard (injected so tests never touch it). */
  clipboard: Pick<Clipboard, 'writeText'>;
}

const NOT_FOUND_OKR = 'The OKR does not exist';
const NOT_FOUND_KR = 'The key result does not exist';

function notFound(message: string): IpcResult<never> {
  return ipcFail('NOT_FOUND', message);
}

function progressInfo(store: OkrStore, krId: string): KrProgressInfo {
  const summary = store.getProgressSummary(krId);
  return { latest: summary.latest, before: summary.before, canRevert: summary.canRevert };
}

/** Reads one OKR with everything the sticky note and the review tab need. */
export function readOkrDetail(store: OkrStore, okrId: string): OkrDetail | null {
  const objective = store.getObjective(okrId);
  if (!objective) {
    return null;
  }
  const progress: Record<string, KrProgressInfo> = {};
  for (const kr of objective.keyResults) {
    progress[kr.id] = progressInfo(store, kr.id);
  }
  return { objective, progress, review: store.getReview(okrId) };
}

function progressReply(
  store: OkrStore,
  kr: KeyResultRecord,
  changed: boolean,
): ProgressChangeReply {
  const objective = store.getObjective(kr.objectiveId);
  return {
    changed,
    keyResult: kr,
    overallProgress: objective ? objective.overallProgress : null,
    progress: progressInfo(store, kr.id),
  };
}

/** Looks up a key result that may still be edited. */
function editableKeyResult(store: OkrStore, krId: string): KeyResultRecord | IpcResult<never> {
  const kr = store.findKeyResult(krId);
  if (!kr) {
    return notFound(NOT_FOUND_KR);
  }
  if (kr.removedAt !== null) {
    return ipcFail('KEY_RESULT_REMOVED', 'The key result was removed and cannot be edited');
  }
  return kr;
}

function isFailure(value: unknown): value is IpcResult<never> {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false;
}

/** Why the latest entry cannot be reverted, or null when it can. */
function revertBlocker(store: OkrStore, krId: string): IpcResult<never> | null {
  const summary = store.getProgressSummary(krId);
  if (summary.latest === null) {
    return ipcFail('NOTHING_TO_REVERT', 'The key result has no progress entry to revert');
  }
  if (!summary.canRevert) {
    return ipcFail('LATEST_IS_REVERT', 'The latest entry is a revert and cannot be reverted again');
  }
  return null;
}

/**
 * Registers the closed-loop channels. Every handler validates its payload first, never
 * throws across IPC, and answers with `IpcResult`. Errors carry a code (and for validation
 * the field and reason) but never a filesystem path or a raw error message.
 */
export function registerClosedLoopHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  deps: ClosedLoopHandlerDeps,
): void {
  const { store, exportService, clipboard } = deps;

  function register<Req, Res>(
    channel: string,
    parse: (payload: unknown) => Parsed<Req>,
    run: (request: Req) => IpcResult<Res> | Promise<IpcResult<Res>>,
  ): void {
    ipcMain.handle(channel, async (_event, payload: unknown) => {
      const parsed = parse(payload);
      if (!parsed.ok) {
        return parsed;
      }
      try {
        return await run(parsed.value);
      } catch (error) {
        if (error instanceof ValidationError) {
          return ipcFail('INVALID_REQUEST', 'The request was rejected', {
            field: 'request',
            reason: 'invalid_value',
          });
        }
        Logger.error(`[ipc] ${channel} failed`, error);
        return ipcFail('INTERNAL', 'Something went wrong');
      }
    });
  }

  // The list ignores whatever the renderer sends.
  register<void, OkrListReply>(
    IPC_CHANNELS.OKR_LIST,
    () => ({ ok: true, value: undefined }),
    () => ipcOk({ items: store.listObjectiveSummaries() }),
  );

  register(IPC_CHANNELS.OKR_OPEN, parseOkrIdRequest, ({ okrId }) => {
    const detail = readOkrDetail(store, okrId);
    return detail ? ipcOk(detail) : notFound(NOT_FOUND_OKR);
  });

  register(IPC_CHANNELS.OKR_PIN, parseOkrIdRequest, ({ okrId }): IpcResult<PinReply> => {
    if (!store.getObjective(okrId)) {
      return notFound(NOT_FOUND_OKR);
    }
    store.pinObjective(okrId);
    return ipcOk({ okrId, pinned: true });
  });

  register(
    IPC_CHANNELS.OKR_SET_PERIOD,
    parseSetPeriodRequest,
    ({ okrId, period }): IpcResult<SetPeriodReply> => {
      if (!store.getObjective(okrId)) {
        return notFound(NOT_FOUND_OKR);
      }
      store.setPeriod(okrId, period);
      const updated = store.getObjective(okrId);
      return ipcOk({ okrId, period, updatedAt: updated ? updated.updatedAt : '' });
    },
  );

  register(
    IPC_CHANNELS.KR_SET_PROGRESS,
    parseSetProgressRequest,
    (request): IpcResult<ProgressChangeReply> => {
      const kr = editableKeyResult(store, request.krId);
      if (isFailure(kr)) return kr;
      const value = request.value === undefined ? kr.progress : request.value;
      if (value === kr.progress && request.status === kr.status) {
        return ipcOk(progressReply(store, kr, false));
      }
      const updated = store.setProgress(kr.id, { value, status: request.status });
      return ipcOk(progressReply(store, updated, true));
    },
  );

  register(
    IPC_CHANNELS.KR_REVERT_PROGRESS,
    parseKrIdRequest,
    ({ krId }): IpcResult<ProgressChangeReply> => {
      const kr = editableKeyResult(store, krId);
      if (isFailure(kr)) return kr;
      const blocked = revertBlocker(store, krId);
      if (blocked) return blocked;
      const updated = store.revertLastProgress(krId);
      return ipcOk(progressReply(store, updated, true));
    },
  );

  register(
    IPC_CHANNELS.KR_REPLACE_PROGRESS,
    parseReplaceProgressRequest,
    (request): IpcResult<ProgressChangeReply> => {
      const kr = editableKeyResult(store, request.krId);
      if (isFailure(kr)) return kr;
      const blocked = revertBlocker(store, kr.id);
      if (blocked) return blocked;
      const status = request.status ?? kr.status;
      // Same value (and status) as now: write nothing.
      if (request.value === kr.progress && status === kr.status) {
        return ipcOk(progressReply(store, kr, false));
      }
      const updated = store.replaceLastProgress(kr.id, { value: request.value, status });
      return ipcOk(progressReply(store, updated, true));
    },
  );

  register(IPC_CHANNELS.REVIEW_GET, parseOkrIdRequest, ({ okrId }): IpcResult<ReviewReply> => {
    if (!store.getObjective(okrId)) {
      return notFound(NOT_FOUND_OKR);
    }
    return ipcOk({ review: store.getReview(okrId) });
  });

  register(
    IPC_CHANNELS.REVIEW_SAVE,
    parseSaveReviewRequest,
    ({ okrId, wentWell, fellShort, nextSteps }): IpcResult<ReviewReply> => {
      if (!store.getObjective(okrId)) {
        return notFound(NOT_FOUND_OKR);
      }
      const review = store.saveReview(okrId, { wentWell, fellShort, nextSteps });
      return ipcOk({ review });
    },
  );

  register(IPC_CHANNELS.EXPORT_SAVE, parseExportRequest, async ({ okrId, format }) => {
    const outcome = await exportService.export(okrId, format);
    return outcome ? ipcOk(outcome) : notFound(NOT_FOUND_OKR);
  });

  // 「复制为 Markdown」: the same text as the .md file, read from the store (no path, no dialog).
  register(IPC_CHANNELS.CLIPBOARD_EXPORT, parseOkrIdRequest, ({ okrId }): IpcResult<CopyReply> => {
    const markdown = exportService.renderMarkdownFor(okrId);
    if (markdown === null) {
      return notFound(NOT_FOUND_OKR);
    }
    clipboard.writeText(markdown);
    return ipcOk({ copied: true });
  });

  register(IPC_CHANNELS.EXPORT_REVEAL, parseRevealRequest, ({ path }) => {
    if (!exportService.reveal(path)) {
      return ipcFail('PATH_NOT_ALLOWED', 'Only the file that was just exported can be revealed');
    }
    return ipcOk({ revealed: true as const });
  });
}
