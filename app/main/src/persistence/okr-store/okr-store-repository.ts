import type { ManualEditRecord, OKRDocument } from '@clarityokr/contracts';
import { PersistenceError } from '@clarityokr/contracts';

import { Logger } from '../../core/logger.js';
import type { OKRRepository } from '../okr-repository.types.js';
import type { OkrStore } from './okr-store.js';
import type { ObjectiveWithKeyResults } from '@clarityokr/contracts';

function toDocument(objective: ObjectiveWithKeyResults): OKRDocument {
  return {
    id: objective.id,
    objective: objective.title,
    keyResults: objective.keyResults
      .filter((kr) => kr.removedAt === null)
      .map((kr) => ({
        id: kr.id,
        statement: kr.statement,
        ...(kr.successMetric ? { successMetric: kr.successMetric } : {}),
      })),
    sourceSessionId: objective.sourceSessionId ?? '',
    generatedAt: objective.createdAt,
    lastEditedAt: objective.updatedAt === objective.createdAt ? null : objective.updatedAt,
    regenerationPolicy: 'overwrite',
    manualEdits: [],
  };
}

/**
 * Serves the document-shaped OKR API used by the clarification flow from the
 * normalized tables. Saving reconciles key results by id, so progress and status
 * survive text edits and regeneration; ids that disappear are marked removed.
 */
export class OkrStoreRepository implements OKRRepository {
  constructor(private readonly store: OkrStore) {}

  async save(okr: OKRDocument): Promise<void> {
    try {
      this.store.syncObjective({
        id: okr.id,
        title: okr.objective,
        sourceSessionId: okr.sourceSessionId || null,
        createdAt: okr.generatedAt,
        keyResults: okr.keyResults.map((kr) => ({
          id: kr.id,
          statement: kr.statement,
          successMetric: kr.successMetric ?? null,
        })),
      });
    } catch (error) {
      Logger.error('[OkrStoreRepository] Failed to save OKR:', error);
      throw new PersistenceError(
        `Failed to save OKR document: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  async findById(okrId: string): Promise<OKRDocument | null> {
    const objective = this.store.getObjective(okrId);
    return objective ? toDocument(objective) : null;
  }

  async findBySessionId(sessionId: string): Promise<OKRDocument[]> {
    return this.store.listObjectivesBySession(sessionId).map(toDocument);
  }

  async getLatestForSession(sessionId: string): Promise<OKRDocument | null> {
    const [latest] = this.store.listObjectivesBySession(sessionId);
    return latest ? toDocument(latest) : null;
  }

  /** The pinned OKR, or the most recently updated one. */
  async loadLatest(): Promise<OKRDocument | null> {
    const current = this.store.getCurrentObjective();
    return current ? toDocument(current) : null;
  }

  /** Edit history is no longer stored; progress and review records replace it. */
  async recordEdit(_okrId: string, _edit: ManualEditRecord): Promise<void> {
    // intentionally empty
  }

  async clear(): Promise<void> {
    try {
      this.store.deleteAllObjectives();
    } catch (error) {
      throw new PersistenceError('Failed to clear OKR documents', error);
    }
  }
}
