/* eslint-disable @typescript-eslint/ban-types */
import { ClarificationController } from '@clarityokr/main/windows/clarification-controller';
import { OkrAgentService } from '@clarityokr/main/services/okr-agent.service';
import { jest } from '@jest/globals';

const handlers: Record<string, Function> = {};
const electStub = {
  ipcMain: {
    handle: (channel: string, cb: Function) => {
      handlers[channel] = cb;
    },
    on: (_: string, __: Function) => void 0,
  },
  webContents: { getAllWebContents: () => [], fromId: (_: number) => ({ send: () => void 0 }) },
} as any;

class SessionRepositoryStub {
  state = {
    session: {
      id: 's1',
      initialIntent: 'improve',
      status: 'collecting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      selectedOptionIds: [],
      confidence: 0,
      pendingQuestionId: null,
    },
  };
  async load() {
    return this.state;
  }
  async saveSession(s: any) {
    this.state.session = s;
  }
}

class OkrRepositoryStub {
  async loadLatest() {
    return null;
  }
  async save() {
    return;
  }
}
class ActionLogWriterStub {
  async append() {
    return;
  }
}
class StickyWindowManagerStub {
  async open() {
    return;
  }
}

describe('Retry idempotence', () => {
  afterAll(() => {
    jest.restoreAllMocks();
    for (const k of Object.keys(handlers)) delete handlers[k];
  });

  it('failed next-question attempt does not duplicate steps when retried and then succeeds', async () => {
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = 'https://llm.example.test';
    const sessionRepo = new SessionRepositoryStub();

    // First call throws
    jest
      .spyOn(OkrAgentService.prototype, 'getNextQuestion')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        question: {
          id: 'q2',
          text: 'Next',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
        },
      });

    // @ts-ignore use stubs
    new ClarificationController(
      sessionRepo,
      new OkrRepositoryStub(),
      new ActionLogWriterStub(),
      new StickyWindowManagerStub(),
      new OkrAgentService(),
      electStub,
    );

    // Initialize session to avoid "No active session found" error
    await sessionRepo.saveSession({
      id: 's1',
      initialIntent: 'test',
      status: 'collecting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      selectedOptionIds: [],
      confidence: 0,
      pendingQuestionId: null,
    });

    const h = handlers['clarityokr:llm:next-question'];

    // First attempt fails
    await expect(
      h(null, { context: { turns: [] }, lastChoice: { questionId: 'q1', optionId: 'a' } }),
    ).rejects.toThrow();
    expect(sessionRepo.state.session.steps.length).toBe(0);

    // Second attempt succeeds
    const res = await h(null, {
      context: { turns: [] },
      lastChoice: { questionId: 'q1', optionId: 'a' },
    });
    expect(res).toHaveProperty('question.id', 'q2');
    expect(sessionRepo.state.session.steps.length).toBe(1);
  });
});
