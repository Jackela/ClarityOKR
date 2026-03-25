import { jest } from '@jest/globals';
import type { SessionManager } from '@clarityokr/main/services/session-manager.service';
import type { OkrRepository } from '@clarityokr/main/persistence/okr-repository';
import type { OkrAgentService } from '@clarityokr/main/services/okr-agent.service';
import { LlmGenerateDraftHandler } from '@clarityokr/main/handlers/llm-generate-draft.handler';
import type { ClarificationSession } from '@clarityokr/contracts';

describe('LlmGenerateDraftHandler', () => {
  let handler: LlmGenerateDraftHandler;
  let mockSessionManager: jest.Mocked<SessionManager>;
  let mockOkrRepository: jest.Mocked<OkrRepository>;
  let mockOkrAgentService: jest.Mocked<OkrAgentService>;
  let mockElectron: any;
  let sentMessages: any[];

  beforeEach(() => {
    mockSessionManager = {
      getSession: jest.fn(),
      getAllSessions: jest.fn(),
    } as unknown as jest.Mocked<SessionManager>;

    mockOkrRepository = {
      save: jest.fn(),
    } as unknown as jest.Mocked<OkrRepository>;

    mockOkrAgentService = {
      generateDraft: jest.fn(),
    } as unknown as jest.Mocked<OkrAgentService>;

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

    mockSessionManager.getSession.mockResolvedValue(session);
    mockOkrAgentService.generateDraft.mockResolvedValue({
      draft: {
        objectives: [
          {
            id: 'o1',
            title: 'Objective 1',
            keyResults: [{ id: 'kr1', statement: 'KR1', target: 10, measurement: 'count' }],
          },
        ],
      },
    });
    mockOkrRepository.save.mockResolvedValue(undefined);

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
    await expect(
      handler.handle({
        sessionId: '',
        context: { turns: [] },
      }),
    ).rejects.toThrow('Invalid request payload');
  });

  it('should throw error when session not found', async () => {
    mockSessionManager.getSession.mockResolvedValue(null);
    mockSessionManager.getAllSessions.mockReturnValue(new Map());

    await expect(
      handler.handle({
        sessionId: 'nonexistent',
        context: { turns: [] },
      }),
    ).rejects.toThrow('No active session found');
  });
});
