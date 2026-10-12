import { jest } from '@jest/globals';
import { clarificationSessionSchema } from '@clarityokr/contracts';
import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager';
import { SqliteSessionRepository } from '@clarityokr/main/persistence/sqlite-session-repository';
import { OkrStore } from '@clarityokr/main/persistence/okr-store/okr-store';
import { OkrStoreRepository } from '@clarityokr/main/persistence/okr-store/okr-store-repository';
import { OkrRegenerationService } from '@clarityokr/main/services/okr-regeneration.service';
import type { OkrAgentService } from '@clarityokr/main/services/okr-agent.service';

const response = {
  objective: 'Generated objective',
  keyResults: [{ id: 'generated', statement: 'Measurable result' }],
};
const time = '2026-10-09T00:00:00.000Z';
describe('Actual regeneration persistence and failure boundaries', () => {
  let db: ConnectionManager;
  let sessions: SqliteSessionRepository;
  let okrs: OkrStoreRepository;
  let store: OkrStore;
  let agent: {
    clearCache: ReturnType<typeof jest.fn>;
    generateDraft: ReturnType<typeof jest.fn<(context: unknown) => Promise<unknown>>>;
  };
  let service: OkrRegenerationService;
  beforeEach(async () => {
    db = new ConnectionManager({ dbPath: ':memory:' });
    db.initialize();
    sessions = new SqliteSessionRepository(db);
    store = new OkrStore(db.getDb());
    okrs = new OkrStoreRepository(store);
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
        keyResults: [{ id: expect.any(String), statement: 'Measurable result' }],
      });
      // Generated ids are never trusted: a fresh id is assigned.
      expect(result.value.keyResults[0]?.id).not.toBe('generated');
      const stored = await okrs.findById(result.value.id);
      expect(stored).toMatchObject({
        id: result.value.id,
        objective: 'Generated objective',
        sourceSessionId: 'synthetic',
        keyResults: JSON.parse(JSON.stringify(result.value.keyResults)),
      });
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

  describe('keeps progress by key result id', () => {
    const draft = (keyResults: Array<{ id: string; statement: string; successMetric?: string }>) =>
      ({ objective: 'Generated objective', keyResults }) as const;

    async function seed() {
      agent.generateDraft.mockResolvedValue(
        draft([
          { id: 'x', statement: 'First result', successMetric: '10 users' },
          { id: 'y', statement: 'Second result' },
        ]),
      );
      const first = await service.regenerate('synthetic', 'overwrite');
      if (!first.ok) throw first.error;
      const [a, b] = first.value.keyResults;
      if (!a || !b) throw new Error('fixture');
      store.setProgress(a.id, { value: 60, status: 'in_progress' });
      store.setProgress(b.id, { value: 20, status: 'at_risk' });
      return { okrId: first.value.id, a, b };
    }

    it('sends the existing key results so the model can return their ids', async () => {
      const { a, b } = await seed();
      agent.generateDraft.mockClear();
      await service.regenerate('synthetic', 'overwrite');
      expect(agent.generateDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          existingKeyResults: [
            { id: a.id, statement: 'First result', successMetric: '10 users' },
            { id: b.id, statement: 'Second result' },
          ],
        }),
      );
    });

    it('replaces text and metric of a returned id, keeps its progress and status', async () => {
      const { okrId, a, b } = await seed();
      agent.generateDraft.mockResolvedValue(
        draft([
          { id: a.id, statement: 'First result, reworded', successMetric: '25 users' },
          { id: b.id, statement: 'Second result' },
        ]),
      );
      const result = await service.regenerate('synthetic', 'overwrite');
      expect(result.ok).toBe(true);
      const loaded = store.getObjective(okrId);
      expect(
        loaded?.keyResults.map((k) => [k.id, k.statement, k.successMetric, k.progress, k.status]),
      ).toEqual([
        [a.id, 'First result, reworded', '25 users', 60, 'in_progress'],
        [b.id, 'Second result', null, 20, 'at_risk'],
      ]);
    });

    it('treats a reordered response by id, not by position', async () => {
      const { okrId, a, b } = await seed();
      agent.generateDraft.mockResolvedValue(
        draft([
          { id: b.id, statement: 'Second result' },
          { id: a.id, statement: 'First result' },
        ]),
      );
      await service.regenerate('synthetic', 'overwrite');
      const loaded = store.getObjective(okrId);
      expect(loaded?.keyResults.map((k) => [k.id, k.progress])).toEqual([
        [b.id, 20],
        [a.id, 60],
      ]);
    });

    it('treats key results without a known id as new and marks the old ones removed, keeping history', async () => {
      const { okrId, a, b } = await seed();
      agent.generateDraft.mockResolvedValue(
        draft([
          { id: 'made-up-1', statement: 'Brand new' },
          { id: 'made-up-2', statement: 'Another' },
        ]),
      );
      await service.regenerate('synthetic', 'overwrite');
      const loaded = store.getObjective(okrId);
      const active = loaded?.keyResults.filter((k) => k.removedAt === null) ?? [];
      expect(active.map((k) => [k.statement, k.progress])).toEqual([
        ['Brand new', null],
        ['Another', null],
      ]);
      expect(loaded?.overallProgress).toBeNull();
      const removed = loaded?.keyResults.filter((k) => k.removedAt !== null).map((k) => k.id);
      expect(removed).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(store.listProgressEntries(a.id)).toHaveLength(1);
      expect(store.listProgressEntries(b.id)).toHaveLength(1);
    });

    it('marks a key result removed when the response drops its id and keeps the others', async () => {
      const { okrId, a, b } = await seed();
      agent.generateDraft.mockResolvedValue(draft([{ id: a.id, statement: 'First result' }]));
      await service.regenerate('synthetic', 'overwrite');
      const loaded = store.getObjective(okrId);
      expect(loaded?.keyResults.find((k) => k.id === a.id)?.progress).toBe(60);
      expect(loaded?.keyResults.find((k) => k.id === b.id)?.removedAt).not.toBeNull();
      expect(loaded?.overallProgress).toBe(60);
    });

    it('never reuses a returned id twice and ignores ids of other objectives', async () => {
      const { okrId, a } = await seed();
      agent.generateDraft.mockResolvedValue(
        draft([
          { id: a.id, statement: 'Keeps identity' },
          { id: a.id, statement: 'Duplicate id becomes new' },
        ]),
      );
      await service.regenerate('synthetic', 'overwrite');
      const active =
        store.getObjective(okrId)?.keyResults.filter((k) => k.removedAt === null) ?? [];
      expect(active).toHaveLength(2);
      expect(new Set(active.map((k) => k.id)).size).toBe(2);
      expect(active[0]).toMatchObject({ id: a.id, progress: 60 });
      expect(active[1]?.progress).toBeNull();
    });

    it('append policy keeps every existing key result with its progress and adds new ones', async () => {
      const { okrId, a, b } = await seed();
      agent.generateDraft.mockResolvedValue(draft([{ id: 'n', statement: 'Appended' }]));
      await service.regenerate('synthetic', 'append');
      const loaded = store.getObjective(okrId);
      expect(
        loaded?.keyResults.map((k) => [k.statement, k.progress, k.removedAt === null]),
      ).toEqual([
        ['First result', 60, true],
        ['Second result', 20, true],
        ['Appended', null, true],
      ]);
      expect(loaded?.keyResults[0]?.id).toBe(a.id);
      expect(loaded?.keyResults[1]?.id).toBe(b.id);
    });
  });
});
