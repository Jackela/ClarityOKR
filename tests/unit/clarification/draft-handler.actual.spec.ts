import { jest } from '@jest/globals';
import { okrDocumentSchema, clarificationSessionSchema } from '@clarityokr/contracts';
import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager';
import { SqliteSessionRepository } from '@clarityokr/main/persistence/sqlite-session-repository';
import {
  ClarificationDraftHandler,
  ClarificationSessionManager,
  ClarificationResponseHandler,
  ClarificationStateMachine,
  DraftValidationError,
  LLMError,
  SessionNotFoundError,
  ValidationError,
} from '@clarityokr/main/clarification/index';
import type { OkrAgentService } from '@clarityokr/main/services/okr-agent.service';

const valid = {
  draft: {
    objectives: [
      {
        title: 'Synthetic objective',
        keyResults: [{ statement: 'A measurable result', target: 0, measurement: 'errors' }],
      },
    ],
  },
};
describe('Actual session-to-draft boundary', () => {
  let db: ConnectionManager;
  let sessions: ClarificationSessionManager;
  let handler: ClarificationDraftHandler;
  let agent: { generateDraft: ReturnType<typeof jest.fn<(context: unknown) => Promise<unknown>>> };
  beforeEach(() => {
    db = new ConnectionManager({ dbPath: ':memory:' });
    db.initialize();
    sessions = new ClarificationSessionManager(
      new SqliteSessionRepository(db),
      new ClarificationStateMachine(),
    );
    agent = {
      generateDraft: jest.fn<(context: unknown) => Promise<unknown>>().mockResolvedValue(valid),
    };
    handler = new ClarificationDraftHandler(
      sessions,
      new ClarificationStateMachine(),
      agent as unknown as OkrAgentService,
    );
  });
  afterEach(() => db.close());
  it('rejects missing IDs and absent sessions before calling the agent', async () => {
    await expect(handler.generateDraft('')).rejects.toBeInstanceOf(ValidationError);
    await expect(handler.generateDraft('missing')).rejects.toBeInstanceOf(SessionNotFoundError);
    expect(agent.generateDraft).not.toHaveBeenCalled();
  });
  it('uses actual turns and returns a contract-valid document with generated IDs and zero target', async () => {
    const session = sessions.createSession('synthetic', 'Synthetic intent');
    session.steps = [
      {
        id: 'prompt',
        question: 'Question?',
        sequence: 1,
        options: [
          { id: 'choice', label: 'Choice', scopeTag: 'synthetic' },
          { id: 'other', label: 'Other', scopeTag: 'synthetic' },
        ],
        context: 'Synthetic',
      },
    ];
    expect(clarificationSessionSchema.safeParse(session).success).toBe(true);
    await new ClarificationResponseHandler(
      sessions,
      new ClarificationStateMachine(),
    ).handleResponse(session.id, 'prompt', 'choice');
    const result = await handler.generateDraft(session.id);
    expect(result.session.status).toBe('ready');
    expect(okrDocumentSchema.safeParse(result.okr).success).toBe(true);
    expect(result.okr).toMatchObject({
      objective: 'Synthetic objective',
      sourceSessionId: session.id,
      keyResults: [{ statement: 'A measurable result', successMetric: '0 errors' }],
    });
    expect(agent.generateDraft).toHaveBeenCalledWith({
      turns: [{ questionId: 'prompt', optionId: 'choice', timestamp: expect.any(String) }],
    });
  });
  it('uses a description, explicit result ID and optional metric without changing an already-ready session', async () => {
    const session = sessions.createSession('synthetic', 'Synthetic intent');
    session.status = 'ready';
    agent.generateDraft.mockResolvedValue({
      draft: {
        objectives: [
          {
            description: 'Described objective',
            keyResults: [{ id: 'result', statement: 'Result without metric' }],
          },
        ],
      },
    });
    const result = await handler.generateDraft(session.id);
    expect(result.session.status).toBe('ready');
    expect(result.okr.objective).toBe('Described objective');
    expect(result.okr.keyResults).toEqual([
      {
        id: 'result',
        statement: 'Result without metric',
        successMetric: undefined,
        owner: undefined,
      },
    ]);
  });
  it.each([new Error('provider refused'), 'opaque failure'])(
    'normalizes provider failure (%p)',
    async (failure) => {
      sessions.createSession('synthetic', 'Synthetic intent');
      agent.generateDraft.mockRejectedValue(failure);
      await expect(handler.generateDraft('synthetic')).rejects.toBeInstanceOf(LLMError);
    },
  );
  it.each([null, 'text', { wrong: true }, { draft: { objectives: [{}] } }])(
    'rejects invalid provider envelopes (%p)',
    async (reply) => {
      sessions.createSession('synthetic', 'Synthetic intent');
      agent.generateDraft.mockResolvedValue(reply);
      await expect(handler.generateDraft('synthetic')).rejects.toThrow();
      expect(handler.validateDraft({ wrong: true })).toBe(false);
      expect(handler.validateDraft(valid)).toBe(true);
    },
  );
  it.each([
    { title: 'Objective' },
    { title: 'Objective', keyResults: [{}] },
    { title: 'x'.repeat(201), keyResults: [{ statement: 'Result' }] },
    { title: 'Objective', keyResults: [{ statement: 'x'.repeat(181) }] },
  ])('rejects drafts outside the public OKR contract (%p)', async (objective) => {
    sessions.createSession('synthetic', 'Synthetic intent');
    agent.generateDraft.mockResolvedValue({ draft: { objectives: [objective] } });
    await expect(handler.generateDraft('synthetic')).rejects.toBeInstanceOf(DraftValidationError);
  });
});
