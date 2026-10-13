import {
  ipcFail,
  ipcOk,
  type IpcResult,
  type ObjectiveWithKeyResults,
  type RegenerateKrsReply,
  type RegenerateKrsRequest,
} from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import { readOkrDetail } from '../ipc/closed-loop-handlers.js';
import type { OkrStore } from '../persistence/okr-store/okr-store.js';
import type { ClarificationContext } from '../services/okr-agent.types.js';
import { planRegeneration, readReturnedKeyResults, type CurrentKr } from './plan-regeneration.js';

export interface KrRegenerationDeps {
  store: Pick<OkrStore, 'getObjective' | 'syncObjective' | 'getProgressSummary' | 'getReview'>;
  /** The clarification answers of the session the OKR came from ([] when unknown). */
  turnsFor: (sessionId: string | null) => Promise<ClarificationContext['turns']>;
  /** Asks the model for a draft (may throw). */
  generate: (context: ClarificationContext) => Promise<unknown>;
  newId: () => string;
  /** The stored OKR changed: tell the windows (their text comes from the document). */
  changed: (objective: ObjectiveWithKeyResults) => void;
}

const FAILED = 'The regeneration did not complete; nothing was changed';

/**
 * Spec §3.7 regeneration of all / the selected key results of one OKR. Nothing is written
 * unless the model returned a usable list and it was stored in one transaction; any failure
 * leaves the list as it was (`REGENERATE_FAILED`, no raw error text).
 */
export class KrRegenerationService {
  private readonly running = new Set<string>();

  constructor(private readonly deps: KrRegenerationDeps) {}

  async regenerate(request: RegenerateKrsRequest): Promise<IpcResult<RegenerateKrsReply>> {
    const objective = this.deps.store.getObjective(request.okrId);
    if (!objective) return ipcFail('NOT_FOUND', 'The OKR does not exist');
    const active: CurrentKr[] = objective.keyResults
      .filter((kr) => kr.removedAt === null)
      .sort((a, b) => a.position - b.position)
      .map((kr) => ({ id: kr.id, statement: kr.statement, successMetric: kr.successMetric }));
    if (request.krIds) {
      for (const id of request.krIds) {
        const kr = objective.keyResults.find((k) => k.id === id);
        if (!kr) return ipcFail('NOT_FOUND', 'The key result does not exist');
        if (kr.removedAt !== null) {
          return ipcFail('KEY_RESULT_REMOVED', 'The key result was removed');
        }
      }
    }
    if (this.running.has(objective.id)) {
      return ipcFail('INVALID_REQUEST', 'A regeneration of this OKR is already running');
    }
    this.running.add(objective.id);
    try {
      const sent = request.krIds ? active.filter((kr) => request.krIds!.includes(kr.id)) : active;
      const context: ClarificationContext = {
        turns: await this.deps.turnsFor(objective.sourceSessionId ?? null),
        ...(sent.length > 0
          ? {
              existingKeyResults: sent.map((kr) => ({
                id: kr.id,
                statement: kr.statement,
                ...(kr.successMetric ? { successMetric: kr.successMetric } : {}),
              })),
            }
          : {}),
      };
      const returned = readReturnedKeyResults(await this.deps.generate(context));
      if (!returned) return ipcFail('REGENERATE_FAILED', FAILED);
      const plan = planRegeneration(active, returned, this.deps.newId, request.krIds);
      const stored = this.deps.store.syncObjective({
        id: objective.id,
        title: objective.title,
        keyResults: plan.keyResults,
      });
      const detail = readOkrDetail(this.deps.store as OkrStore, objective.id);
      if (!detail) return ipcFail('REGENERATE_FAILED', FAILED);
      this.deps.changed(stored);
      return ipcOk({ detail, summary: plan.summary });
    } catch (error) {
      Logger.error('[regenerate] failed', error instanceof Error ? error.message : 'unknown');
      return ipcFail('REGENERATE_FAILED', FAILED);
    } finally {
      this.running.delete(objective.id);
    }
  }
}
