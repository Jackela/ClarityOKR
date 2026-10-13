import { randomUUID } from 'node:crypto';

import type { OKRDocument } from '@clarityokr/contracts';
import {
  LLMError,
  PersistenceError,
  SessionNotFoundError,
  okrDraftResponseSchema,
  llmOkrGenerationResponseSchema,
  okrDocumentSchema,
} from '@clarityokr/contracts';
import type { DomainError } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { OKRRepository } from '../persistence/okr-repository.types.js';
import type { ISessionRepository } from '../persistence/interfaces/index.js';
import type { OkrAgentService } from './okr-agent.service.js';
import type { ClarificationContext } from './okr-agent.types.js';

/**
 * Result type for operations that can fail with a domain error.
 */
export type Result<T, E extends DomainError> = { ok: true; value: T } | { ok: false; error: E };

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

  /** The clarification answers of a session ([] when there is none), for a draft request. */
  async turnsFor(sessionId: string | null): Promise<ClarificationContext['turns']> {
    if (!sessionId) return [];
    const session = await this.sessionRepo.getById(sessionId);
    return session ? OkrRegenerationService.turnsOf(session) : [];
  }

  /** Asks the model for a fresh draft (the cache would answer the same draft again). */
  async generate(context: ClarificationContext): Promise<unknown> {
    this.okrAgent.clearCache();
    return this.okrAgent.generateDraft(context);
  }

  private static turnsOf(
    session: NonNullable<Awaited<ReturnType<ISessionRepository['getById']>>>,
  ): ClarificationContext['turns'] {
    return session.steps.map((step) => ({
      questionId: step.id,
      optionId:
        session.selectedOptions
          .filter(
            (sel) =>
              sel.promptId === step.id && step.options.some((opt) => opt.id === sel.optionId),
          )
          .at(-1)?.optionId ?? '',
      timestamp: step.context ?? new Date().toISOString(),
    }));
  }

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

      // Build clarification context from session steps and selections.
      // Existing key results are sent along (only when there are any) so the model can
      // return their ids; progress is only carried over for ids that come back.
      const context: ClarificationContext = {
        turns: OkrRegenerationService.turnsOf(session),
        ...(currentOkr && currentOkr.keyResults.length > 0
          ? {
              existingKeyResults: currentOkr.keyResults.map((kr) => ({
                id: kr.id,
                statement: kr.statement,
                ...(kr.successMetric ? { successMetric: kr.successMetric } : {}),
              })),
            }
          : {}),
      };

      // Step 2: Call LLM to generate new OKR draft
      let llmResponse: unknown;
      try {
        this.okrAgent.clearCache();
        llmResponse = await this.okrAgent.generateDraft(context);
      } catch (error) {
        return { ok: false, error: new LLMError('Failed to generate OKR draft', error) };
      }

      const canonical = okrDraftResponseSchema.safeParse(llmResponse);
      const first = canonical.success ? canonical.data.draft.objectives[0] : null;
      const normalized = first
        ? {
            objective: first.title ?? first.description ?? '',
            keyResults: first.keyResults.map((kr) => ({
              id: kr.id,
              statement: kr.statement,
              successMetric: `${kr.target} ${kr.measurement}`,
            })),
          }
        : llmResponse;
      const parsed = llmOkrGenerationResponseSchema.safeParse(normalized);
      if (!parsed.success)
        return { ok: false, error: new LLMError('Invalid regeneration response') };
      const newDraft = parsed.data;

      // Step 3: Generate new OKR document based on policy
      const timestamp = new Date().toISOString();
      let newOkr: OKRDocument;

      const existingIds = new Set((currentOkr?.keyResults ?? []).map((kr) => kr.id));
      // Only an id the model returned that matches an existing key result keeps that
      // identity (and so its progress). Everything else is new with a fresh id.
      const resolveId = (returnedId: string, taken: Set<string>): string => {
        if (existingIds.has(returnedId) && !taken.has(returnedId)) {
          taken.add(returnedId);
          return returnedId;
        }
        return randomUUID();
      };
      const matched = new Set<string>();

      if (policy === 'overwrite') {
        // Complete replacement - create new document
        newOkr = {
          id: currentOkr?.id ?? randomUUID(),
          objective: currentOkr?.objective ?? newDraft.objective,
          keyResults: newDraft.keyResults.map((kr) => ({
            id: resolveId(kr.id, matched),
            statement: kr.statement,
            successMetric: kr.successMetric,
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
          // In append mode existing key results stay as they are; every generated one is new.
          ...newDraft.keyResults.map((kr) => ({
            id: randomUUID(),
            statement: kr.statement,
            successMetric: kr.successMetric,
          })),
        ];

        newOkr = {
          id: currentOkr?.id ?? randomUUID(),
          objective: currentOkr?.objective ?? newDraft.objective,
          keyResults: mergedKeyResults,
          sourceSessionId: sessionId,
          generatedAt: timestamp,
          regenerationPolicy: policy,
          manualEdits: currentOkr?.manualEdits ?? [],
        };
      }

      // Step 4: Save to OKRRepository
      try {
        newOkr = okrDocumentSchema.parse(newOkr);
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
