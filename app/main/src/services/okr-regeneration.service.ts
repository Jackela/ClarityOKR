import type { ISessionRepository } from '../persistence/interfaces/index.js';
import type { OkrAgentService } from './okr-agent.service.js';
import type { ClarificationContext } from './okr-agent.types.js';

/**
 * Builds clarification context and requests a fresh OKR draft from the agent.
 * KR-level regeneration (`KrRegenerationService`) reuses `turnsFor` and `generate`.
 *
 * @module services/okr-regeneration.service
 */
export class OkrRegenerationService {
  constructor(
    private readonly sessionRepo: ISessionRepository,
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
}
