import { describe, expect, it, jest } from '@jest/globals';
import type { OKRDocument } from '@clarityokr/contracts';
import { OkrRegenerationService } from '../../../app/main/src/services/okr-regeneration.service.js';

describe('persisted OKR regeneration', () => {
  const current: OKRDocument = {
    id: 'okr-1',
    objective: 'Manually edited objective',
    sourceSessionId: 'session-1',
    generatedAt: '2026-10-09T00:00:00.000Z',
    regenerationPolicy: 'overwrite',
    manualEdits: [],
    keyResults: [{ id: 'original', statement: 'Existing result' }],
  };
  const draft = {
    draft: {
      objectives: [
        {
          id: 'objective',
          title: 'AI title',
          keyResults: [1, 2, 3].map((id) => ({
            id: `new-${id}`,
            statement: `New result ${id}`,
            target: 100,
            measurement: '%',
          })),
        },
      ],
    },
  };

  function create(
    response: unknown = draft,
    session: unknown = { steps: [], selectedOptions: [] },
  ) {
    const sessions = { getById: jest.fn<() => Promise<unknown>>().mockResolvedValue(session) };
    const repository = {
      getLatestForSession: jest.fn().mockResolvedValue(current),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const agent = {
      clearCache: jest.fn(),
      generateDraft: jest.fn<() => Promise<unknown>>().mockResolvedValue(response),
    };
    return {
      service: new OkrRegenerationService(sessions as any, repository as any, agent as any),
      repository,
      agent,
    };
  }

  it('replaces results using the real canonical LLM envelope while preserving the edited objective', async () => {
    const { service, repository, agent } = create();
    const result = await service.regenerate('session-1', 'overwrite');
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.objective).toBe(current.objective);
    expect(result.value.keyResults.map((kr) => kr.id)).toEqual(['new-1', 'new-2', 'new-3']);
    expect(result.value.keyResults[0].successMetric).toBe('100 %');
    expect(agent.clearCache).toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(result.value);
  });

  it('appends new results while preserving existing results and the edited objective', async () => {
    const { service } = create();
    const result = await service.regenerate('session-1', 'append');
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.keyResults).toHaveLength(4);
    expect(result.value.keyResults[0]).toEqual(current.keyResults[0]);
    expect(result.value.objective).toBe(current.objective);
  });

  it('rejects malformed LLM output without replacing persisted content', async () => {
    const { service, repository } = create({ nonsense: true });
    expect((await service.regenerate('session-1', 'overwrite')).ok).toBe(false);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('does not call the LLM or write data for a missing session', async () => {
    const { service, repository, agent } = create(draft, null);
    expect((await service.regenerate('missing', 'append')).ok).toBe(false);
    expect(agent.generateDraft).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});
