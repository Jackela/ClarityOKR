import { jest } from '@jest/globals';
import type { SessionManager } from '@clarityokr/main/services/session-manager.service';
import type { OkrAgentService } from '@clarityokr/main/services/okr-agent.service';
import { LlmNextQuestionHandler } from '@clarityokr/main/clarification/clarification-prompt-handler';
import type { ClarificationSession } from '@clarityokr/contracts';

describe('LlmNextQuestionHandler', () => {
  let handler: LlmNextQuestionHandler;
  let mockSessionManager: jest.Mocked<SessionManager>;
  let mockOkrAgentService: jest.Mocked<OkrAgentService>;
  let mockElectron: any;
  let sentMessages: any[];

  beforeEach(() => {
    mockSessionManager = {
      loadFromPersistence: jest.fn(),
      addStep: jest.fn(),
    } as unknown as jest.Mocked<SessionManager>;

    mockOkrAgentService = {
      getNextQuestion: jest.fn(),
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

    handler = new LlmNextQuestionHandler(mockSessionManager, mockOkrAgentService, mockElectron);
  });

  it('should return question and broadcast prompt', async () => {
    const session: ClarificationSession = {
      id: 'session-1',
      initialIntent: 'Test',
      status: 'collecting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      selectedOptionIds: [],
      confidence: 0,
      pendingQuestionId: null,
    };

    mockOkrAgentService.getNextQuestion.mockResolvedValue({
      question: {
        id: 'q2',
        text: 'Follow up question?',
        options: [
          { id: 'opt1', label: 'Yes' },
          { id: 'opt2', label: 'No' },
        ],
      },
    });
    mockSessionManager.loadFromPersistence.mockResolvedValue(session);
    mockSessionManager.addStep.mockResolvedValue(undefined);

    const result = await handler.handle({
      context: { turns: [] },
      lastChoice: { questionId: 'q1', optionId: 'opt1' },
    });

    expect(result.question).toBeDefined();
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].channel).toBe('clarityokr:clarification:prompt');
  });

  it('should return data when no more questions', async () => {
    mockOkrAgentService.getNextQuestion.mockResolvedValue({
      question: {
        id: 'complete',
        text: 'Clarification complete',
        options: [
          { id: 'done1', label: 'Option 1' },
          { id: 'done2', label: 'Option 2' },
        ],
      },
    });

    const result = await handler.handle({
      context: { turns: [] },
      lastChoice: { questionId: 'q1', optionId: 'opt1' },
    });

    expect(result.question).toBeDefined();
    expect(result.question.id).toBe('complete');
  });

  it('should handle errors from LLM service', async () => {
    mockOkrAgentService.getNextQuestion.mockRejectedValue(new Error('API error'));

    await expect(
      handler.handle({
        context: { turns: [] },
        lastChoice: { questionId: 'q1', optionId: 'opt1' },
      }),
    ).rejects.toThrow('Failed to get next question: API error');
  });
});
