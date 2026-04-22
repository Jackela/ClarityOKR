import { jest } from '@jest/globals';
import type { ClarificationSession } from '@clarityokr/contracts';
import { ClarificationPromptHandler } from '@clarityokr/main/clarification/clarification-prompt-handler';
import { ValidationError, LLMError } from '@clarityokr/main/clarification/types';
import type { IClarificationSessionManager } from '@clarityokr/main/clarification/interfaces/session-manager.interface';
import type { IClarificationStateMachine } from '@clarityokr/main/clarification/interfaces/state-machine.interface';
import type { OkrAgentService } from '@clarityokr/main/services/okr-agent.service';

/**
 * Factory function to create a test ClarificationSession
 */
function createMockSession(overrides: Partial<ClarificationSession> = {}): ClarificationSession {
  const now = new Date().toISOString();
  return {
    id: 'test-session-001',
    initialIntent: 'Test intent',
    status: 'collecting',
    createdAt: now,
    updatedAt: now,
    steps: [],
    selectedOptionIds: [],
    confidence: 0,
    pendingQuestionId: null,
    ...overrides,
  };
}

describe('ClarificationPromptHandler', () => {
  let handler: ClarificationPromptHandler;
  let mockSessionManager: jest.Mocked<IClarificationSessionManager>;
  let mockStateMachine: jest.Mocked<IClarificationStateMachine>;
  let mockOkrAgentService: jest.Mocked<OkrAgentService>;

  beforeEach(() => {
    mockSessionManager = {
      getSession: jest.fn(),
      createSession: jest.fn(),
      saveSession: jest.fn(),
      endSession: jest.fn(),
      loadFromPersistence: jest.fn(),
    } as unknown as jest.Mocked<IClarificationSessionManager>;

    mockStateMachine = {
      transition: jest.fn(),
      getState: jest.fn(),
      canTransition: jest.fn(),
      getAllowedTransitions: jest.fn(),
    } as unknown as jest.Mocked<IClarificationStateMachine>;

    mockOkrAgentService = {
      getNextQuestion: jest.fn(),
      generateDraft: jest.fn(),
    } as unknown as jest.Mocked<OkrAgentService>;

    handler = new ClarificationPromptHandler(
      mockSessionManager,
      mockStateMachine,
      mockOkrAgentService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // validateIntent
  // ============================================================================
  describe('validateIntent', () => {
    it('should return true for intent with at least 3 characters', () => {
      expect(handler.validateIntent('abc')).toBe(true);
      expect(handler.validateIntent('hello world')).toBe(true);
      expect(handler.validateIntent('   trimmed   ')).toBe(true);
    });

    it('should return false for intent shorter than 3 characters', () => {
      expect(handler.validateIntent('ab')).toBe(false);
      expect(handler.validateIntent('a')).toBe(false);
      expect(handler.validateIntent('')).toBe(false);
    });

    it('should return false for null or undefined intent', () => {
      expect(handler.validateIntent(null as unknown as string)).toBe(false);
      expect(handler.validateIntent(undefined as unknown as string)).toBe(false);
    });

    it('should return false for whitespace-only intent', () => {
      expect(handler.validateIntent('   ')).toBe(false);
      expect(handler.validateIntent('\t\n')).toBe(false);
    });
  });

  // ============================================================================
  // handlePrompt - Happy Path
  // ============================================================================
  describe('handlePrompt - Happy Path', () => {
    it('should create new session when session does not exist', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      const llmResponse = {
        question: {
          id: 'q1',
          text: 'What is your primary goal?',
          options: [
            { id: 'opt1', label: 'Option 1' },
            { id: 'opt2', label: 'Option 2' },
          ],
        },
      };
      mockOkrAgentService.getNextQuestion.mockResolvedValue(llmResponse);

      const result = await handler.handlePrompt('test-session', 'Improve efficiency');

      expect(mockSessionManager.getSession).toHaveBeenCalledWith('test-session');
      expect(mockSessionManager.createSession).toHaveBeenCalledWith('test-session', 'Improve efficiency');
      expect(result).toBeDefined();
      expect(result.id).toBe('q1');
      expect(result.question).toBe('What is your primary goal?');
      expect(result.options).toHaveLength(2);
    });

    it('should reuse existing session when found', async () => {
      const existingSession = createMockSession({
        id: 'test-session',
        steps: [
          {
            id: 'prev-q',
            question: 'Previous question',
            sequence: 0,
            context: 'test',
            options: [{ id: 'opt1', label: 'Option 1' }],
          },
        ],
      });
      mockSessionManager.getSession.mockResolvedValue(existingSession);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      const llmResponse = {
        question: {
          id: 'q2',
          text: 'Next question?',
          options: [
            { id: 'opt1', label: 'Option 1' },
            { id: 'opt2', label: 'Option 2' },
          ],
        },
      };
      mockOkrAgentService.getNextQuestion.mockResolvedValue(llmResponse);

      const result = await handler.handlePrompt('test-session', 'Improve efficiency');

      expect(mockSessionManager.createSession).not.toHaveBeenCalled();
      expect(result.sequence).toBe(1);
    });

    it('should call LLM service with correct parameters', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      const llmResponse = {
        question: {
          id: 'q1',
          text: 'Question?',
          options: [
            { id: 'opt1', label: 'Option 1' },
            { id: 'opt2', label: 'Option 2' },
          ],
        },
      };
      mockOkrAgentService.getNextQuestion.mockResolvedValue(llmResponse);

      await handler.handlePrompt('session-1', 'Test intent');

      expect(mockOkrAgentService.getNextQuestion).toHaveBeenCalledWith(
        { turns: [] },
        { questionId: 'init', optionId: 'Test intent' },
      );
    });

    it('should save session and transition state after generating prompt', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      const llmResponse = {
        question: {
          id: 'q1',
          text: 'Question?',
          options: [
            { id: 'opt1', label: 'Option 1' },
            { id: 'opt2', label: 'Option 2' },
          ],
        },
      };
      mockOkrAgentService.getNextQuestion.mockResolvedValue(llmResponse);

      await handler.handlePrompt('session-1', 'Test intent');

      expect(mockSessionManager.saveSession).toHaveBeenCalledWith(session);
      expect(mockStateMachine.canTransition).toHaveBeenCalledWith('collecting', 'ready');
      expect(mockStateMachine.transition).toHaveBeenCalledWith(session, 'ready');
    });

    it('should map LLM options to ClarificationPrompt options correctly', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(false);

      const llmResponse = {
        question: {
          id: 'q1',
          text: 'What is your goal?',
          options: [
            { id: 'opt1', label: 'Increase revenue' },
            { id: 'opt2', label: 'Reduce costs' },
            { id: 'opt3', label: 'Improve quality' },
          ],
        },
      };
      mockOkrAgentService.getNextQuestion.mockResolvedValue(llmResponse);

      const result = await handler.handlePrompt('session-1', 'Test');

      expect(result.options).toHaveLength(3);
      expect(result.options[0]).toEqual({
        id: 'opt1',
        label: 'Increase revenue',
        description: undefined,
        scopeTag: 'llm',
      });
      expect(result.options[1]).toEqual({
        id: 'opt2',
        label: 'Reduce costs',
        description: undefined,
        scopeTag: 'llm',
      });
    });
  });

  // ============================================================================
  // handlePrompt - Error Cases
  // ============================================================================
  describe('handlePrompt - Error Cases', () => {
    it('should throw ValidationError for intent shorter than 3 characters', async () => {
      await expect(handler.handlePrompt('session-1', 'ab')).rejects.toThrow(ValidationError);
      await expect(handler.handlePrompt('session-1', 'ab')).rejects.toThrow(
        'Intent must be at least 3 characters long',
      );
    });

    it('should throw ValidationError for empty intent', async () => {
      await expect(handler.handlePrompt('session-1', '')).rejects.toThrow(ValidationError);
    });

    it('should throw LLMError when LLM service fails', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue(session);
      mockOkrAgentService.getNextQuestion.mockRejectedValue(new Error('Network timeout'));

      await expect(handler.handlePrompt('session-1', 'Test intent')).rejects.toThrow(LLMError);
      await expect(handler.handlePrompt('session-1', 'Test intent')).rejects.toThrow(
        'Failed to generate clarification prompt',
      );
    });

    it('should throw LLMError for non-object LLM response', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue(session);
      mockOkrAgentService.getNextQuestion.mockResolvedValue(null);

      await expect(handler.handlePrompt('session-1', 'Test intent')).rejects.toThrow(
        'Empty or invalid response from LLM service',
      );
    });

    it('should throw LLMError for invalid LLM response structure', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue(session);
      mockOkrAgentService.getNextQuestion.mockResolvedValue({ invalid: true });

      await expect(handler.handlePrompt('session-1', 'Test intent')).rejects.toThrow(
        'LLM response validation failed',
      );
    });

    it('should throw LLMError when question fields are missing', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue(session);
      mockOkrAgentService.getNextQuestion.mockResolvedValue({
        question: { id: '', text: '', options: [{ id: 'opt1', label: 'L1' }, { id: 'opt2', label: 'L2' }] },
      });

      await expect(handler.handlePrompt('session-1', 'Test intent')).rejects.toThrow(
        'LLM response validation failed',
      );
    });
  });

  // ============================================================================
  // getNextQuestion - Happy Path
  // ============================================================================
  describe('getNextQuestion - Happy Path', () => {
    it('should return next question for existing session', async () => {
      const session = createMockSession({
        steps: [
          {
            id: 'q1',
            question: 'First question',
            sequence: 0,
            context: 'test',
            options: [{ id: 'opt1', label: 'Option 1' }],
          },
        ],
      });
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);

      const llmResponse = {
        question: {
          id: 'q2',
          text: 'Second question?',
          options: [
            { id: 'opt1', label: 'Yes' },
            { id: 'opt2', label: 'No' },
          ],
        },
      };
      mockOkrAgentService.getNextQuestion.mockResolvedValue(llmResponse);

      const result = await handler.getNextQuestion('session-1', 'q1', {
        turns: [{ questionId: 'q1', optionId: 'opt1', timestamp: new Date().toISOString() }],
      });

      expect(result.id).toBe('q2');
      expect(result.sequence).toBe(1);
      expect(result.options).toHaveLength(2);
    });

    it('should call LLM with context and current question ID', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);

      const llmResponse = {
        question: {
          id: 'q2',
          text: 'Next?',
          options: [
            { id: 'opt1', label: 'Option 1' },
            { id: 'opt2', label: 'Option 2' },
          ],
        },
      };
      mockOkrAgentService.getNextQuestion.mockResolvedValue(llmResponse);

      const context = {
        turns: [{ questionId: 'q1', optionId: 'opt1', timestamp: '2024-01-01T00:00:00Z' }],
      };

      await handler.getNextQuestion('session-1', 'q1', context);

      expect(mockOkrAgentService.getNextQuestion).toHaveBeenCalledWith(context, {
        questionId: 'q1',
        optionId: '',
      });
    });

    it('should save session with new prompt appended', async () => {
      const session = createMockSession({ steps: [] });
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);

      const llmResponse = {
        question: {
          id: 'q1',
          text: 'Question?',
          options: [
            { id: 'opt1', label: 'Option 1' },
            { id: 'opt2', label: 'Option 2' },
          ],
        },
      };
      mockOkrAgentService.getNextQuestion.mockResolvedValue(llmResponse);

      await handler.getNextQuestion('session-1', 'init', { turns: [] });

      expect(mockSessionManager.saveSession).toHaveBeenCalledWith(session);
      expect(session.steps).toHaveLength(1);
      expect(session.steps[0].id).toBe('q1');
    });
  });

  // ============================================================================
  // getNextQuestion - Error Cases
  // ============================================================================
  describe('getNextQuestion - Error Cases', () => {
    it('should throw ValidationError when session not found', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);

      await expect(
        handler.getNextQuestion('missing-session', 'q1', { turns: [] }),
      ).rejects.toThrow(ValidationError);
      await expect(
        handler.getNextQuestion('missing-session', 'q1', { turns: [] }),
      ).rejects.toThrow('Session not found: missing-session');
    });

    it('should throw LLMError when LLM service fails', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(session);
      mockOkrAgentService.getNextQuestion.mockRejectedValue(new Error('Service unavailable'));

      await expect(
        handler.getNextQuestion('session-1', 'q1', { turns: [] }),
      ).rejects.toThrow(LLMError);
      await expect(
        handler.getNextQuestion('session-1', 'q1', { turns: [] }),
      ).rejects.toThrow('Failed to get next question');
    });

    it('should throw LLMError for empty response', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(session);
      mockOkrAgentService.getNextQuestion.mockResolvedValue(undefined);

      await expect(
        handler.getNextQuestion('session-1', 'q1', { turns: [] }),
      ).rejects.toThrow('Empty or invalid response from LLM service');
    });

    it('should throw LLMError for response missing question fields', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(session);
      mockOkrAgentService.getNextQuestion.mockResolvedValue({
        question: { id: '', text: '', options: [{ id: 'opt1', label: 'L1' }, { id: 'opt2', label: 'L2' }] },
      });

      await expect(
        handler.getNextQuestion('session-1', 'q1', { turns: [] }),
      ).rejects.toThrow('LLM response validation failed');
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe('Edge Cases', () => {
    it('should handle LLM response with minimum required options', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(false);

      const llmResponse = {
        question: {
          id: 'q1',
          text: 'Open-ended question?',
          options: [
            { id: 'opt1', label: 'Yes' },
            { id: 'opt2', label: 'No' },
          ],
        },
      };
      mockOkrAgentService.getNextQuestion.mockResolvedValue(llmResponse);

      const result = await handler.handlePrompt('session-1', 'Test');

      expect(result.options).toHaveLength(2);
    });

    it('should handle intent with special characters', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(false);

      const llmResponse = {
        question: {
          id: 'q1',
          text: 'Question?',
          options: [
            { id: 'opt1', label: 'Option 1' },
            { id: 'opt2', label: 'Option 2' },
          ],
        },
      };
      mockOkrAgentService.getNextQuestion.mockResolvedValue(llmResponse);

      const specialIntent = '🎯 Improve efficiency 中文 ñ';
      const result = await handler.handlePrompt('session-1', specialIntent);

      expect(result).toBeDefined();
      expect(mockOkrAgentService.getNextQuestion).toHaveBeenCalledWith(
        { turns: [] },
        { questionId: 'init', optionId: specialIntent },
      );
    });

    it('should not transition state when transition is not allowed', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(null);
      mockSessionManager.createSession.mockReturnValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(false);

      const llmResponse = {
        question: {
          id: 'q1',
          text: 'Question?',
          options: [
            { id: 'opt1', label: 'Option 1' },
            { id: 'opt2', label: 'Option 2' },
          ],
        },
      };
      mockOkrAgentService.getNextQuestion.mockResolvedValue(llmResponse);

      await handler.handlePrompt('session-1', 'Test intent');

      expect(mockStateMachine.transition).not.toHaveBeenCalled();
    });
  });
});
