import type electron from 'electron';

import { ClarificationController } from '../../../app/main/src/windows/clarification-controller';
import { IPCChannels } from '../../../app/main/src/bootstrap/ipc-channels';

const handlers: Record<string, Function> = {};
const sent: Array<{ channel: string; payload: unknown }> = [];

const electStub = {
  ipcMain: {
    handle: (channel: string, cb: Function) => {
      handlers[channel] = cb;
    },
    on: (_channel: string, _cb: Function) => void 0,
  },
  webContents: {
    getAllWebContents: () => [
      {
        send: (channel: string, payload: unknown) => {
          sent.push({ channel, payload });
        },
      },
    ],
    fromId: (_id: number) => ({ send: (_ch: string, _payload: unknown) => void 0 }),
  },
} as unknown as typeof electron;

class SessionRepositoryStub {
  state: { session: any } = {
    session: {
      id: 's-integration',
      initialIntent: 'improve-quality',
      status: 'collecting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [] as any[],
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

class LlmServiceStub {
  async getNextQuestion() {
    return {
      question: {
        id: 'q-test',
        text: 'Test?',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      },
    };
  }
  async generateDraft() {
    return {
      draft: {
        objectives: [
          {
            id: 'o-1',
            title: 'Test Objective',
            keyResults: [
              { id: 'kr1', statement: 'KR 1', target: 10, measurement: 'count' },
              { id: 'kr2', statement: 'KR 2', target: '5%', measurement: 'rate' },
            ],
          },
        ],
      },
    };
  }
}

class OkrBuilderStub {
  mapLlmQuestionToPrompt(q: any, seq: number) {
    return {
      id: q.id,
      sequence: seq,
      question: q.text,
      context: '',
      options: (q.options || []).map((o: any) => ({ ...o, scopeTag: 'llm' })),
    };
  }
  buildOkrFromLlmDraft(session: any, draft: any) {
    const firstObjective = draft.draft?.objectives?.[0];
    return {
      id: 'okr-test',
      objective: firstObjective?.title || 'Test Objective',
      keyResults: firstObjective?.keyResults || [],
      sourceSessionId: session.id,
      generatedAt: new Date().toISOString(),
      regenerationPolicy: 'overwrite' as const,
      manualEdits: [],
    };
  }
}

describe('Integration: IPC LLM handlers (main)', () => {
  beforeAll(() => {
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = 'http://127.0.0.1:7777';
    process.env.LLM_MODEL = 'test-model';
  });

  afterEach(() => {
    sent.length = 0;
  });

  it('LLM_NEXT_QUESTION returns a valid question', async () => {
    const deps = {
      sessionRepository: new SessionRepositoryStub() as any,
      okrRepository: new OkrRepositoryStub() as any,
      actionLogWriter: new ActionLogWriterStub() as any,
      stickyWindowManager: new StickyWindowManagerStub() as any,
      llmService: new LlmServiceStub() as any,
      okrBuilder: new OkrBuilderStub() as any,
      elect: electStub,
    };

    new ClarificationController(deps);

    const h = handlers[IPCChannels.LLM_NEXT_QUESTION];
    const res = await h(null, {
      context: { turns: [] },
      lastChoice: { questionId: 'init', optionId: 'hi' },
    });

    (expect(res) as any).toHaveProperty('question.id', 'q-test');
    (expect(res) as any).toHaveProperty('question.options');
  });

  it('LLM_GENERATE_DRAFT builds and broadcasts OKR response', async () => {
    const sessionRepo = new SessionRepositoryStub();
    (sessionRepo.state.session.steps as any[]).push({
      id: 'q1',
      sequence: 0,
      question: 'init',
      context: 'seed',
      options: [
        { id: 'a', label: 'A', scopeTag: 'llm' },
        { id: 'b', label: 'B', scopeTag: 'llm' },
      ],
    });

    const deps = {
      sessionRepository: sessionRepo as any,
      okrRepository: new OkrRepositoryStub() as any,
      actionLogWriter: new ActionLogWriterStub() as any,
      stickyWindowManager: new StickyWindowManagerStub() as any,
      llmService: new LlmServiceStub() as any,
      okrBuilder: new OkrBuilderStub() as any,
      elect: electStub,
    };

    new ClarificationController(deps);

    const h = handlers[IPCChannels.LLM_GENERATE_DRAFT];
    const res = await h(null, { context: { turns: [] } });

    (expect(res) as any).toHaveProperty('okr.objective');
    const broadcasted = sent.some((m) => m.channel === IPCChannels.OKR_GENERATE);
    expect(broadcasted).toBe(true);
  });
});
