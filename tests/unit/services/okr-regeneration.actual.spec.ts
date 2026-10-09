import { jest } from '@jest/globals';
import { clarificationSessionSchema } from '@clarityokr/contracts';
import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager';
import { SqliteSessionRepository } from '@clarityokr/main/persistence/sqlite-session-repository';
import { OKRRepositorySqlite } from '@clarityokr/main/persistence/okr-repository';
import { OkrRegenerationService } from '@clarityokr/main/services/okr-regeneration.service';
import type { OkrAgentService } from '@clarityokr/main/services/okr-agent.service';

const response = {
  objective: 'Generated objective',
  keyResults: [{ id: 'generated', statement: 'Measurable result', owner: 'Team' }],
};
const time = '2026-10-09T00:00:00.000Z';
describe('Actual regeneration persistence and failure boundaries', () => {
  let db: ConnectionManager;
  let sessions: SqliteSessionRepository;
  let okrs: OKRRepositorySqlite;
  let agent: {
    clearCache: ReturnType<typeof jest.fn>;
    generateDraft: ReturnType<typeof jest.fn<(context: unknown) => Promise<unknown>>>;
  };
  let service: OkrRegenerationService;
  beforeEach(async () => {
    db = new ConnectionManager({ dbPath: ':memory:' });
    db.initialize();
    sessions = new SqliteSessionRepository(db);
    okrs = new OKRRepositorySqlite(db);
    await sessions.save({
      id: 'synthetic',
      initialIntent: 'Synthetic intent',
      status: 'ready',
      createdAt: time,
      updatedAt: time,
      confidence: 1,
      selectedOptions: [{ promptId: 'selected', optionId: 'choice', selectedAt: time }],
      steps: [
        {
          id: 'selected',
          question: 'Question',
          options: [
            { id: 'choice', label: 'Choice', scopeTag: 'synthetic' },
            { id: 'alternative', label: 'Alternative', scopeTag: 'synthetic' },
          ],
          sequence: 1,
          context: time,
        },
        {
          id: 'unanswered',
          question: 'Question',
          options: [
            { id: 'other', label: 'Other', scopeTag: 'synthetic' },
            { id: 'another', label: 'Another', scopeTag: 'synthetic' },
          ],
          sequence: 2,
          context: time,
        },
      ],
    });
    expect(clarificationSessionSchema.safeParse(await sessions.getById('synthetic')).success).toBe(
      true,
    );
    agent = {
      clearCache: jest.fn(),
      generateDraft: jest.fn<(context: unknown) => Promise<unknown>>().mockResolvedValue(response),
    };
    service = new OkrRegenerationService(sessions, okrs, agent as unknown as OkrAgentService);
  });
  afterEach(() => db.close());
  it.each(['append', 'overwrite'] as const)(
    'persists an initial %s document when no earlier OKR exists and sends real selections',
    async (policy) => {
      const result = await service.regenerate('synthetic', policy);
      expect(result.ok).toBe(true);
      if (!result.ok) throw result.error;
      expect(result.value).toMatchObject({
        objective: 'Generated objective',
        sourceSessionId: 'synthetic',
        regenerationPolicy: policy,
        manualEdits: [],
        keyResults: response.keyResults,
      });
      expect(await okrs.findById(result.value.id)).toMatchObject(
        JSON.parse(JSON.stringify(result.value)),
      );
      expect(agent.generateDraft).toHaveBeenCalledWith({
        turns: [
          { questionId: 'selected', optionId: 'choice', timestamp: time },
          { questionId: 'unanswered', optionId: '', timestamp: time },
        ],
      });
    },
  );
  it("uses each prompt's latest persisted selection even when option IDs repeat across prompts", async () => {
    const session = await sessions.getById('synthetic');
    if (!session) throw new Error('Fixture session missing');
    session.steps = ['first', 'second'].map((id, index) => ({
      id,
      sequence: index,
      question: 'Question',
      context: time,
      options: [
        { id: 'a', label: 'A', scopeTag: 'synthetic' },
        { id: 'b', label: 'B', scopeTag: 'synthetic' },
      ],
    }));
    session.selectedOptions = [
      { promptId: 'first', optionId: 'a', selectedAt: time },
      { promptId: 'second', optionId: 'a', selectedAt: time },
      { promptId: 'second', optionId: 'b', selectedAt: time },
    ];
    await sessions.save(session);
    expect((await service.regenerate('synthetic', 'overwrite')).ok).toBe(true);
    expect(agent.generateDraft).toHaveBeenCalledWith({
      turns: [
        { questionId: 'first', optionId: 'a', timestamp: time },
        { questionId: 'second', optionId: 'b', timestamp: time },
      ],
    });
  });
  it('accepts the canonical description alternative and persists its numeric metric', async () => {
    agent.generateDraft.mockResolvedValue({
      draft: {
        objectives: [
          {
            id: 'objective',
            description: 'Described objective',
            keyResults: [1, 2, 3].map((id) => ({
              id: `generated-${id}`,
              statement: `Result ${id}`,
              target: 0,
              measurement: 'errors',
            })),
          },
        ],
      },
    });
    const result = await service.regenerate('synthetic', 'append');
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.objective).toBe('Described objective');
    expect(result.value.keyResults[0].successMetric).toBe('0 errors');
  });
  it('keeps persisted content when the external provider rejects', async () => {
    agent.generateDraft.mockRejectedValue(new Error('provider refused'));
    const result = await service.regenerate('synthetic', 'overwrite');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure');
    expect(result.error.message).toContain('Failed to generate');
    expect(await okrs.loadLatest()).toBeNull();
  });
  it('does not report a save success when the database closes during provider execution', async () => {
    agent.generateDraft.mockImplementation(async () => {
      db.close();
      return response;
    });
    const result = await service.regenerate('synthetic', 'overwrite');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure');
    expect(result.error.message).toContain('Failed to save');
  });
  it.each([new Error('read refused'), 'opaque storage failure'])(
    'reports upstream repository failure (%p)',
    async (failure) => {
      jest.spyOn(sessions, 'getById').mockRejectedValue(failure);
      const result = await service.regenerate('synthetic', 'append');
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected failure');
      expect(result.error.message).toContain(
        failure instanceof Error ? failure.message : 'Unknown error',
      );
      expect(agent.generateDraft).not.toHaveBeenCalled();
      expect(await okrs.loadLatest()).toBeNull();
    },
  );
});
