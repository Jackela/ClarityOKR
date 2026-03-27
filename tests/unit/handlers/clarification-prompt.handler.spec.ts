import { jest } from '@jest/globals';
import type { SessionManager } from '@clarityokr/main/services/session-manager.service';
import { ClarificationPromptHandler } from '@clarityokr/main/clarification/clarification-prompt-handler';
import type { OkrAgentService } from '@clarityokr/main/services/okr-agent.service';
import type { ClarificationSession } from '@clarityokr/contracts';

describe('ClarificationPromptHandler', () => {
  let handler: ClarificationPromptHandler;
  let mockSessionManager: jest.Mocked<SessionManager>;
  let mockOkrAgentService: jest.Mocked<OkrAgentService>;

  beforeEach(() => {
    mockSessionManager = {
      getSession: jest.fn(),
      createSession: jest.fn(),
      addStep: jest.fn(),
    } as unknown as jest.Mocked<SessionManager>;

    mockOkrAgentService = {
      getNextQuestion: jest.fn(),
    } as unknown as jest.Mocked<OkrAgentService>;

    handler = new ClarificationPromptHandler(mockSessionManager, mockOkrAgentService);
  });

  describe('handle', () => {
    it('should create new session when session does not exist', async () => {
      const mockSession: ClarificationSession = {
        id: 'session-1',
        initialIntent: 'Test intent',
        status: 'collecting',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: [],
        selectedOptionIds: [],
        confidence: 0,
        pendingQuestionId: null,
      };

      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue(mockSession);
      mockSessionManager.addStep.mockResolvedValue(undefined);
      mockOkrAgentService.getNextQuestion.mockResolvedValue({
        question: {
          id: 'q1',
          text: 'Test question?',
          options: [
            { id: 'opt1', label: 'Option 1' },
            { id: 'opt2', label: 'Option 2' },
          ],
        },
      });

      const result = await handler.handle({
        sessionId: 'session-1',
        intent: 'Test intent',
      });

      expect(mockSessionManager.createSession).toHaveBeenCalledWith('session-1', 'Test intent');
      expect(result.prompt.id).toBe('q1');
      expect(result.prompt.question).toBe('Test question?');
      expect(result.prompt.options).toHaveLength(2);
    });

    it('should use existing session when found', async () => {
      const existingSession: ClarificationSession = {
        id: 'session-2',
        initialIntent: 'Existing intent',
        status: 'collecting',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: [],
        selectedOptionIds: [],
        confidence: 0.3,
        pendingQuestionId: null,
      };

      mockSessionManager.getSession.mockResolvedValue(existingSession);
      mockSessionManager.addStep.mockResolvedValue(undefined);
      mockOkrAgentService.getNextQuestion.mockResolvedValue({
        question: {
          id: 'q2',
          text: 'Another question?',
          options: [
            { id: 'opt1', label: 'Yes' },
            { id: 'opt2', label: 'No' },
          ],
        },
      });

      const result = await handler.handle({
        sessionId: 'session-2',
        intent: 'New intent', // Should be ignored, existing session used
      });

      expect(mockSessionManager.createSession).not.toHaveBeenCalled();
      expect(result.prompt.id).toBe('q2');
    });

    it('should throw error when LLM service fails', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue({
        id: 'session-3',
        initialIntent: 'Test',
        status: 'collecting',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: [],
        selectedOptionIds: [],
        confidence: 0,
        pendingQuestionId: null,
      } as ClarificationSession);
      mockOkrAgentService.getNextQuestion.mockRejectedValue(new Error('LLM timeout'));

      await expect(
        handler.handle({
          sessionId: 'session-3',
          intent: 'Test',
        }),
      ).rejects.toThrow();
    });

    it('should throw error for empty response', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue({
        id: 'session-4',
        initialIntent: 'Test',
        status: 'collecting',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: [],
        selectedOptionIds: [],
        confidence: 0,
        pendingQuestionId: null,
      } as ClarificationSession);
      mockOkrAgentService.getNextQuestion.mockResolvedValue(null);

      await expect(
        handler.handle({
          sessionId: 'session-4',
          intent: 'Test',
        }),
      ).rejects.toThrow();
    });

    it('should throw error for response missing question fields', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue({
        id: 'session-5',
        initialIntent: 'Test',
        status: 'collecting',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: [],
        selectedOptionIds: [],
        confidence: 0,
        pendingQuestionId: null,
      } as ClarificationSession);
      mockOkrAgentService.getNextQuestion.mockResolvedValue({
        question: { text: 'Missing id' }, // Missing id and options
      });

      await expect(
        handler.handle({
          sessionId: 'session-5',
          intent: 'Test',
        }),
      ).rejects.toThrow();
    });
  });
});
