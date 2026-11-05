import { jest } from '@jest/globals';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { ConnectionManager } from '@clarityokr/main/persistence/connection-manager';
import { SqliteSessionRepository } from '@clarityokr/main/persistence/sqlite-session-repository';
import {
  ClarificationDraftHandler,
  ClarificationResponseHandler,
  ClarificationSessionManager,
  ClarificationStateMachine,
} from '@clarityokr/main/clarification/index';
import type { OkrAgentService } from '@clarityokr/main/services/okr-agent.service';

const prompt = (n: number): ClarificationPrompt => ({
  id: `q${n}`,
  question: `问题 ${n}`,
  sequence: n - 1,
  context: '目标',
  options: [
    { id: `q${n}-a`, label: 'A', scopeTag: 'llm' },
    { id: `q${n}-b`, label: 'B', scopeTag: 'llm' },
  ],
});

/**
 * #116: a wizard restored at step n−1 (question n was being generated when the session ended)
 * continues the saved session. The main process may already hold question n, never shown.
 */
describe('#116 continuing a restored wizard session (real SQLite session store)', () => {
  let db: ConnectionManager;
  const agent = {
    generateDraft: jest.fn<(context: unknown) => Promise<unknown>>().mockResolvedValue({
      draft: { objectives: [{ title: '目标', keyResults: [{ statement: 'KR' }] }] },
    }),
  };
  /** A new app launch: fresh in-memory caches over the same database. */
  const launch = () => {
    const sessions = new ClarificationSessionManager(
      new SqliteSessionRepository(db),
      new ClarificationStateMachine(),
    );
    return {
      sessions,
      responses: new ClarificationResponseHandler(sessions, new ClarificationStateMachine()),
      drafts: new ClarificationDraftHandler(
        sessions,
        new ClarificationStateMachine(),
        agent as unknown as OkrAgentService,
      ),
    };
  };

  beforeEach(async () => {
    agent.generateDraft.mockClear();
    db = new ConnectionManager({ dbPath: ':memory:' });
    db.initialize();
    // before the session ended: q1 and q2 answered, q3 generated but never shown
    const first = launch();
    const session = first.sessions.createSession('wiz-1', '目标');
    session.steps = [prompt(1), prompt(2), prompt(3)];
    session.selectedOptions = [
      { promptId: 'q1', optionId: 'q1-a', selectedAt: '2026-11-05T00:00:00.000Z' },
      { promptId: 'q2', optionId: 'q2-a', selectedAt: '2026-11-05T00:00:01.000Z' },
    ];
    await first.sessions.saveSession(session);
  });
  afterEach(() => db.close());

  it('answering a question again replaces its answer and drops the questions after it', async () => {
    const app = launch();
    await app.responses.handleResponse('wiz-1', 'q2', 'q2-b');
    const reloaded = await launch().sessions.getSession('wiz-1');
    expect(reloaded?.steps.map((s) => s.id)).toEqual(['q1', 'q2']);
    expect(reloaded?.selectedOptions.map((s) => [s.promptId, s.optionId])).toEqual([
      ['q1', 'q1-a'],
      ['q2', 'q2-b'],
    ]);
  });

  it('生成 OKR leaves out a trailing question that was never answered', async () => {
    const app = launch();
    await app.drafts.generateDraft('wiz-1');
    const context = agent.generateDraft.mock.calls[0][0] as {
      turns: { questionId: string; optionId: string }[];
    };
    expect(context.turns.map((t) => [t.questionId, t.optionId])).toEqual([
      ['q1', 'q1-a'],
      ['q2', 'q2-a'],
    ]);
  });

  it('after a restart, concurrent readers of the session share one object (no lost answer)', async () => {
    const app = launch();
    const [a, b] = await Promise.all([
      app.sessions.getSession('wiz-1'),
      app.sessions.getSession('wiz-1'),
    ]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
});
