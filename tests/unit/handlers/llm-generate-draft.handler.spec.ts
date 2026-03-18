import type { SessionManager } from '../../../app/main/src/services/session-manager.service.js';
import type { OkrRepository } from '../../../app/main/src/persistence/okr-repository.js';
import type { OkrAgentService } from '../../../app/main/src/services/okr-agent.service.js';
import { LlmGenerateDraftHandler } from '../../../app/main/src/handlers/llm-generate-draft.handler.js';
import type { ClarificationSession, OKRDocument } from '@clarityokr/contracts';

describe('LlmGenerateDraftHandler', () => {
  let handler: LlmGenerateDraftHandler;
  let mockSessionManager: jasmine.SpyObj<SessionManager>;
  let mockOkrRepository: jasmine.SpyObj<OkrRepository>;
  let mockOkrAgentService: jasmine.SpyObj<OkrAgentService>;
  let mockElectron: any;
  let sentMessages: any[];

  beforeEach(() => {
    mockSessionManager = jasmine.createSpyObj('SessionManager', ['getSession']);
    mockOkrRepository = jasmine.createSpyObj('OkrRepository', ['save']);
    mockOkrAgentService = jasmine.createSpyObj('OkrAgentService', ['generateDraft']);
    sentMessages = [];
    mockElectron = {
      webContents: {
        getAllWebContents: () => [
          {
            send: (channel: string, payload: any) => {
              sentMessages.push({ channel, payload });
            },
          },
        ],
      },
    };

    handler = new LlmGenerateDraftHandler(
      mockSessionManager,
      mockOkrRepository,
      mockOkrAgentService,
      mockElectron,
    );
  });

  it('should generate OKR draft and broadcast', async () => {
    const session: ClarificationSession = {
      id: 'session-1',
      initialIntent: 'Test',
      status: 'collecting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      selectedOptionIds: [],
      confidence: 0.8,
      pendingQuestionId: null,
    };

    mockSessionManager.getSession.and.returnValue(Promise.resolve(session));
    mockOkrAgentService.generateDraft.and.returnValue(
      Promise.resolve({
        draft: {
          objectives: [
            {
              id: 'o1',
              title: 'Objective 1',
              keyResults: [{ id: 'kr1', statement: 'KR1', target: 10, measurement: 'count' }],
            },
          ],
        },
      }),
    );
    mockOkrRepository.save.and.returnValue(Promise.resolve());

    const result = await handler.handle({
      sessionId: 'session-1',
      context: { turns: [] },
    });

    expect(result.okr).toBeDefined();
    expect(result.okr.objective).toBe('Objective 1');
    expect(mockOkrRepository.save).toHaveBeenCalled();
    expect(sentMessages.length).toBe(1);
  });

  it('should throw error when session ID is missing', async () => {
    await expectAsync(
      handler.handle({
        sessionId: '',
        context: { turns: [] },
      }),
    ).toBeRejectedWithError('Session ID is required');
  });

  it('should throw error when session not found', async () => {
    mockSessionManager.getSession.and.returnValue(Promise.resolve(null));
    mockSessionManager.getAllSessions.and.returnValue(new Map());

    await expectAsync(
      handler.handle({
        sessionId: 'nonexistent',
        context: { turns: [] },
      }),
    ).toBeRejectedWithError('No active session found');
  });
});
