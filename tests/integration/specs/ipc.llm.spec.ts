import nock from 'nock';
import { jest } from '@jest/globals';

import { ClarificationController } from '../../../app/main/src/windows/clarification-controller';
import { IPCChannels } from '../../../app/main/src/bootstrap/ipc-channels';

// Simple Electron stubs to capture handlers and observe broadcasts
const handlers: Record<string, Function> = {};
const sent: Array<{ channel: string; payload: unknown }> = [];

const electStub = {
  ipcMain: {
    handle: (channel: string, cb: Function) => {
      handlers[channel] = cb;
    },
    on: (_channel: string, _cb: Function) => void 0
  },
  webContents: {
    getAllWebContents: () => [
      {
        send: (channel: string, payload: unknown) => {
          sent.push({ channel, payload });
        }
      }
    ],
    fromId: (_id: number) => ({ send: (_ch: string, _payload: unknown) => void 0 })
  }
} as any;

// Minimal repository/service stubs for controller wiring
class SessionRepositoryStub {
  state = {
    session: {
      id: 's-integration',
      initialIntent: 'improve-quality',
      status: 'collecting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      selectedOptionIds: [],
      confidence: 0,
      pendingQuestionId: null
    }
  };
  async load() { return this.state; }
  async saveSession(s: any) { this.state.session = s; }
}

class OkrRepositoryStub { async loadLatest() { return null; } async save() { return; } }
class ActionLogWriterStub { async append() { return; } }
class StickyWindowManagerStub { async open() { return; } }

describe('Integration: IPC LLM handlers (main)', () => {
  beforeAll(() => {
    // Provide test env for LLM client
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = 'http://127.0.0.1:7777';
    process.env.LLM_MODEL = 'test-model';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    sent.length = 0;
  });

  it('LLM_NEXT_QUESTION returns a valid question and does not leak secrets', async () => {
    const scope = nock(process.env.LLM_BASE_URL!)
      .post('/v1/responses')
      .reply(200, {
        question: {
          id: 'q-next',
          text: 'What is the priority?',
          options: [
            { id: 'hi', label: 'High' },
            { id: 'lo', label: 'Low' }
          ]
        }
      });

    // @ts-ignore use stubs
    new ClarificationController(new SessionRepositoryStub(), new OkrRepositoryStub(), new ActionLogWriterStub(), new StickyWindowManagerStub(), electStub);

    const h = handlers[IPCChannels.LLM_NEXT_QUESTION];
    const res = await h(null, { context: { turns: [] }, lastChoice: { questionId: 'init', optionId: 'hi' } });

    expect(res).toHaveProperty('question.id', 'q-next');
    expect(JSON.stringify(res)).not.toContain(process.env.LLM_API_KEY!);
    expect(scope.isDone()).toBe(true);
  });

  it('LLM_GENERATE_DRAFT builds and broadcasts OKR response (no secret leakage)', async () => {
    const scope = nock(process.env.LLM_BASE_URL!)
      .post('/v1/responses')
      .reply(200, {
        draft: {
          objectives: [
            {
              id: 'o-int',
              title: 'Improve Quality',
              keyResults: [
                { id: 'kr1', statement: 'Reduce bugs', target: 10, measurement: 'count' },
                { id: 'kr2', statement: 'Lower escape rate', target: '5%', measurement: 'rate' },
                { id: 'kr3', statement: 'Faster MTTR', target: '2h', measurement: 'latency' }
              ]
            }
          ]
        }
      });

    // Seed session with one step so context inference has data
    const sessionRepo = new SessionRepositoryStub();
    sessionRepo.state.session.steps = [
      {
        id: 'q1',
        sequence: 0,
        question: 'init',
        context: 'seed',
        options: [
          { id: 'a', label: 'A', scopeTag: 'llm' },
          { id: 'b', label: 'B', scopeTag: 'llm' }
        ]
      }
    ];

    // @ts-ignore use stubs
    new ClarificationController(sessionRepo, new OkrRepositoryStub(), new ActionLogWriterStub(), new StickyWindowManagerStub(), electStub);

    const h = handlers[IPCChannels.LLM_GENERATE_DRAFT];
    const res = await h(null, { sessionId: 's-integration', context: { turns: [] } });

    expect(res).toHaveProperty('okr.objective');
    expect(JSON.stringify(res)).not.toContain(process.env.LLM_API_KEY!);
    expect(scope.isDone()).toBe(true);
    // Verify broadcast occurred
    const broadcasted = sent.some((m) => m.channel === IPCChannels.OKR_GENERATE);
    expect(broadcasted).toBe(true);
  });
});
