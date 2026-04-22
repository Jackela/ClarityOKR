import { randomUUID } from 'node:crypto';

import type { OKRDocument } from '@clarityokr/contracts';
import { LLMError, PersistenceError, SessionNotFoundError } from '@clarityokr/contracts';
import type { DomainError } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { OKRRepository } from '../persistence/okr-repository.types.js';
import type { ISessionRepository } from '../persistence/interfaces/index.js';
import type { OkrAgentService } from './okr-agent.service.js';

/**
 * Result type for operations that can fail with a domain error.
 */
export type Result<T, E extends DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Service for OKR regeneration business logic.
 *
 * Encapsulates the domain logic for regenerating OKRs from clarification
 * sessions, including session retrieval, LLM draft generation, policy
 * application (overwrite/append), and persistence.
 *
 * @module services/okr-regeneration.service
 */
export class OkrRegenerationService {
  /**
   * Creates a new OKR regeneration service instance.
   *
   * @param sessionRepo - Repository for session persistence
   * @param okrRepo - Repository for OKR persistence
   * @param okrAgent - Service for LLM OKR generation
   */
  constructor(
    private readonly sessionRepo: ISessionRepository,
    private readonly okrRepo: OKRRepository,
    private readonly okrAgent: OkrAgentService,
  ) {}

  /**
   * Regenerates an OKR with the specified policy.
   * Retrieves clarification context from session, calls LLM to generate new OKR draft,
   * applies the policy (overwrite or append), saves to repository.
   *
   * @param sessionId - The clarification session ID
   * @param policy - The regeneration policy ('overwrite' or 'append')
   * @returns Result containing the regenerated OKR or a domain error
   *
   * @usage
   * ```typescript
   * const result = await okrRegenerationService.regenerate('session-123', 'overwrite');
   * if (result.ok) {
   *   console.log('Regenerated OKR:', result.value);
   * } else {
   *   console.error('Regeneration failed:', result.error);
   * }
   * ```
   */
  async regenerate(
    sessionId: string,
    policy: 'overwrite' | 'append',
  ): Promise<Result<OKRDocument, DomainError>> {
    Logger.info('[main] regenerating OKR', { sessionId, policy });

    try {
      // Step 1: Retrieve clarification context from session
      const session = await this.sessionRepo.getById(sessionId);
      if (!session) {
        return { ok: false, error: new SessionNotFoundError(sessionId) };
      }

      // Get current OKR for the session (needed for append policy)
      const currentOkr = await this.okrRepo.getLatestForSession(sessionId);

      // Build clarification context from session steps and selections
      const context = {
        turns: session.steps.map((step) => ({
          questionId: step.id,
          optionId:
            session.selectedOptions.find((sel) =>
              step.options.some((opt) => opt.id === sel.optionId),
            )?.optionId ?? '',
          timestamp: step.context ?? new Date().toISOString(),
        })),
      };

      // Step 2: Call LLM to generate new OKR draft
      let llmResponse: unknown;
      try {
        llmResponse = await this.okrAgent.generateDraft(context);
      } catch (error) {
        return { ok: false, error: new LLMError('Failed to generate OKR draft', error) };
      }

      const newDraft = llmResponse as {
        objective: string;
        keyResults: Array<{
          id: string;
          statement: string;
          successMetric?: string;
          owner?: string;
        }>;
      };

      // Step 3: Generate new OKR document based on policy
      const timestamp = new Date().toISOString();
      let newOkr: OKRDocument;

      if (policy === 'overwrite') {
        // Complete replacement - create new document
        newOkr = {
          id: currentOkr?.id ?? randomUUID(),
          objective: newDraft.objective,
          keyResults: newDraft.keyResults.map((kr) => ({
            id: kr.id,
            statement: kr.statement,
            successMetric: kr.successMetric,
            owner: kr.owner,
          })),
          sourceSessionId: sessionId,
          generatedAt: timestamp,
          regenerationPolicy: policy,
          manualEdits: currentOkr?.manualEdits ?? [],
        };
      } else {
        // Append policy - merge new KRs into existing OKR
        const existingKeyResults = currentOkr?.keyResults ?? [];
        const mergedKeyResults = [
          ...existingKeyResults,
          ...newDraft.keyResults.map((kr) => ({
            id: kr.id,
            statement: kr.statement,
            successMetric: kr.successMetric,
            owner: kr.owner,
          })),
        ];

        newOkr = {
          id: currentOkr?.id ?? randomUUID(),
          objective: newDraft.objective,
          keyResults: mergedKeyResults,
          sourceSessionId: sessionId,
          generatedAt: timestamp,
          regenerationPolicy: policy,
          manualEdits: currentOkr?.manualEdits ?? [],
        };
      }

      // Step 4: Save to OKRRepository
      try {
        await this.okrRepo.save(newOkr);
      } catch (error) {
        return {
          ok: false,
          error: new PersistenceError('Failed to save regenerated OKR', error),
        };
      }

      Logger.info('[main] OKR regenerated successfully', { okrId: newOkr.id, policy });
      return { ok: true, value: newOkr };
    } catch (error) {
      Logger.error('[main] Failed to regenerate OKR', { sessionId, policy, error });
      if (error instanceof Error) {
        return {
          ok: false,
          error: new PersistenceError(error.message, error),
        };
      }
      return {
        ok: false,
        error: new PersistenceError('Unknown error during OKR regeneration', error),
      };
    }
  }
}
