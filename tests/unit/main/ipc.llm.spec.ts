/* eslint-disable @typescript-eslint/ban-types */
import { ClarificationController } from '@clarityokr/main/windows/clarification-controller';

// Capture handlers and a stub webContents
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
} as any;

// Minimal stubs for repositories and services
class SessionRepositoryStub {
  private state = {
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
  async saveSession(session: any) {
    this.state.session = session;
  }
}

class OkrRepositoryStub {
  async loadLatest() {
    return null;
  }
  async save(_doc: any) {
    return;
  }
}

class ActionLogWriterStub {
  async append(_entry: any) {
    return;
  }
}

class StickyWindowManagerStub {
  async open(_doc: any) {
    return;
  }
}

// Mock main LLM agent methods via prototype override
import { OkrAgentService } from '@clarityokr/main/services/okr-agent.service';
import { jest } from '@jest/globals';

describe('Main IPC LLM Handlers', () => {
  beforeAll(() => {
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = 'https://llm.example.test';
    process.env.LLM_MODEL = 'gpt-4o-mini';
    // Override agent methods for predictable behavior
    // eslint-disable-next-line @typescript-eslint/unbound-method
    jest.spyOn(OkrAgentService.prototype, 'getNextQuestion').mockResolvedValue({
      question: {
        id: 'q2',
        text: 'LLM question',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      },
    } as any);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    jest.spyOn(OkrAgentService.prototype, 'generateDraft').mockResolvedValue({
      draft: {
        objectives: [
          {
            id: 'o1',
            title: 'Objective 1',
            keyResults: [
              { id: 'kr1', statement: 'KR1', target: '10%', measurement: 'rate' },
              { id: 'kr2', statement: 'KR2', target: 5, measurement: 'count' },
              { id: 'kr3', statement: 'KR3', target: '2s', measurement: 'latency' },
            ],
          },
        ],
      },
    } as any);

    // Instantiate controller to register handlers with stubbed electron
    // @ts-ignore - using stubs that satisfy API surface
    new ClarificationController(
      new SessionRepositoryStub(),
      new OkrRepositoryStub(),
      new ActionLogWriterStub(),
      new StickyWindowManagerStub(),
      new OkrAgentService(),
      electStub,
    );
  });

  afterEach(() => {
    // Ensure per-test messages are cleared
    sent.length = 0;
  });

  afterAll(() => {
    // Restore all spies/mocks and clear handler registry
    jest.restoreAllMocks();
    for (const k of Object.keys(handlers)) delete handlers[k];
  });

  it('registers LLM handlers', () => {
    expect(typeof handlers['clarityokr:llm:next-question']).toBe('function');
    expect(typeof handlers['clarityokr:llm:generate-draft']).toBe('function');
  });

  it('LLM_NEXT_QUESTION maps and broadcasts a ClarificationPrompt', async () => {
    const h = handlers['clarityokr:llm:next-question'];
    const result = await h(null, {
      context: { turns: [] },
      lastChoice: { questionId: 'q1', optionId: 'a' },
    });
    expect(result).toHaveProperty('question.id', 'q2');
    const hasBroadcast = sent.some((m) => m.channel === 'clarityokr:clarification:prompt');
    expect(hasBroadcast).toBe(true);
  });

  it('LLM_GENERATE_DRAFT generates and broadcasts OKR payload', async () => {
    const h = handlers['clarityokr:llm:generate-draft'];
    const result = await h(null, { sessionId: 's1', context: { turns: [] } });
    expect(result).toHaveProperty('okr.objective');
    const hasBroadcast = sent.some((m) => m.channel === 'clarityokr:okr:generate');
    expect(hasBroadcast).toBe(true);
  });
});
