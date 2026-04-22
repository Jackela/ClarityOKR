import { jest } from '@jest/globals';
import type { ClarificationSession } from '@clarityokr/contracts';
import { ClarificationResponseHandler } from '@clarityokr/main/clarification/clarification-response-handler';
import { SessionNotFoundError, InvalidSelectionError } from '@clarityokr/main/clarification/types';
import type { IClarificationSessionManager } from '@clarityokr/main/clarification/interfaces/session-manager.interface';
import type { IClarificationStateMachine } from '@clarityokr/main/clarification/interfaces/state-machine.interface';

/**
 * Factory function to create a test ClarificationSession with prompts
 */
function createMockSession(overrides: Partial<ClarificationSession> = {}): ClarificationSession {
  const now = new Date().toISOString();
  return {
    id: 'test-session-001',
    initialIntent: 'Test intent',
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    steps: [
      {
        id: 'prompt-1',
        question: 'What is your goal?',
        sequence: 0,
        context: 'goal-definition',
        options: [
          { id: 'opt-1', label: 'Option 1', scopeTag: 'tag1' },
          { id: 'opt-2', label: 'Option 2', scopeTag: 'tag2', description: 'With description' },
        ],
      },
      {
        id: 'prompt-2',
        question: 'What is your timeline?',
        sequence: 1,
        context: 'timeline',
        options: [
          { id: 'opt-3', label: 'Short term', scopeTag: 'timeline' },
          { id: 'opt-4', label: 'Long term', scopeTag: 'timeline' },
        ],
      },
    ],
    selectedOptions: [],
    confidence: 0,
    pendingQuestionId: 'prompt-2',
    ...overrides,
  };
}

describe('ClarificationResponseHandler', () => {
  let handler: ClarificationResponseHandler;
  let mockSessionManager: jest.Mocked<IClarificationSessionManager>;
  let mockStateMachine: jest.Mocked<IClarificationStateMachine>;

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

    handler = new ClarificationResponseHandler(mockSessionManager, mockStateMachine);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // handleResponse - Happy Path
  // ============================================================================
  describe('handleResponse - Happy Path', () => {
    it('should record selection for valid prompt and option', async () => {
      const session = createMockSession({ pendingQuestionId: 'prompt-1' });
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      await handler.handleResponse('test-session-001', 'prompt-1', 'opt-1');

      expect(mockSessionManager.getSession).toHaveBeenCalledWith('test-session-001');
      expect(session.selectedOptions).toHaveLength(1);
      expect(session.selectedOptions[0].optionId).toBe('opt-1');
      expect(session.selectedOptions[0].promptId).toBe('prompt-1');
    });

    it('should save session after recording selection', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      await handler.handleResponse('test-session-001', 'prompt-1', 'opt-2');

      expect(mockSessionManager.saveSession).toHaveBeenCalledWith(session);
    });

    it('should transition state from ready to collecting when allowed', async () => {
      const session = createMockSession({ status: 'ready' });
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      await handler.handleResponse('test-session-001', 'prompt-1', 'opt-1');

      expect(mockStateMachine.canTransition).toHaveBeenCalledWith('ready', 'collecting');
      expect(mockStateMachine.transition).toHaveBeenCalledWith(session, 'collecting');
    });

    it('should clear pendingQuestionId after selection', async () => {
      const session = createMockSession({ pendingQuestionId: 'prompt-1' });
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      await handler.handleResponse('test-session-001', 'prompt-1', 'opt-1');

      expect(session.pendingQuestionId).toBeNull();
    });

    it('should update updatedAt timestamp after selection', async () => {
      const oldTimestamp = '2024-01-01T00:00:00.000Z';
      const session = createMockSession({ updatedAt: oldTimestamp });
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      await handler.handleResponse('test-session-001', 'prompt-1', 'opt-1');

      expect(new Date(session.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(oldTimestamp).getTime(),
      );
    });

    it('should handle selection for second prompt', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      await handler.handleResponse('test-session-001', 'prompt-2', 'opt-3');

      expect(session.selectedOptions).toHaveLength(1);
      expect(session.selectedOptions[0].optionId).toBe('opt-3');
    });
  });

  // ============================================================================
  // handleResponse - Error Cases
  // ============================================================================
  describe('handleResponse - Error Cases', () => {
    it('should throw InvalidSelectionError when sessionId is empty', async () => {
      await expect(handler.handleResponse('', 'prompt-1', 'opt-1')).rejects.toThrow(
        InvalidSelectionError,
      );
      await expect(handler.handleResponse('', 'prompt-1', 'opt-1')).rejects.toThrow(
        'SessionId, promptId, and optionId are required',
      );
    });

    it('should throw InvalidSelectionError when promptId is empty', async () => {
      await expect(handler.handleResponse('session-1', '', 'opt-1')).rejects.toThrow(
        InvalidSelectionError,
      );
    });

    it('should throw InvalidSelectionError when optionId is empty', async () => {
      await expect(handler.handleResponse('session-1', 'prompt-1', '')).rejects.toThrow(
        InvalidSelectionError,
      );
    });

    it('should throw SessionNotFoundError when session does not exist', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);

      await expect(handler.handleResponse('missing-session', 'prompt-1', 'opt-1')).rejects.toThrow(
        SessionNotFoundError,
      );
      await expect(handler.handleResponse('missing-session', 'prompt-1', 'opt-1')).rejects.toThrow(
        'Session not found: missing-session',
      );
    });

    it('should throw InvalidSelectionError when prompt not found in session', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(session);

      await expect(
        handler.handleResponse('test-session-001', 'nonexistent-prompt', 'opt-1'),
      ).rejects.toThrow(InvalidSelectionError);
      await expect(
        handler.handleResponse('test-session-001', 'nonexistent-prompt', 'opt-1'),
      ).rejects.toThrow('Prompt nonexistent-prompt not found in session');
    });

    it('should throw InvalidSelectionError when option not found in prompt', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(session);

      await expect(
        handler.handleResponse('test-session-001', 'prompt-1', 'nonexistent-opt'),
      ).rejects.toThrow(InvalidSelectionError);
      await expect(
        handler.handleResponse('test-session-001', 'prompt-1', 'nonexistent-opt'),
      ).rejects.toThrow('Option nonexistent-opt not found in prompt prompt-1');
    });
  });

  // ============================================================================
  // recordSelection
  // ============================================================================
  describe('recordSelection', () => {
    it('should append selection to existing selections', async () => {
      const session = createMockSession({
        selectedOptions: [
          { promptId: 'prompt-1', optionId: 'opt-1', selectedAt: '2024-01-01T00:00:00Z' },
        ],
      });
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      await handler.recordSelection(session, 'opt-3');

      expect(session.selectedOptions).toHaveLength(2);
      expect(session.selectedOptions[1].optionId).toBe('opt-3');
    });

    it('should set pendingQuestionId to null', async () => {
      const session = createMockSession({ pendingQuestionId: 'prompt-2' });
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      await handler.recordSelection(session, 'opt-1');

      expect(session.pendingQuestionId).toBeNull();
    });

    it('should not transition state when transition is not allowed', async () => {
      const session = createMockSession({ status: 'completed' });
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(false);

      await handler.recordSelection(session, 'opt-1');

      expect(mockStateMachine.transition).not.toHaveBeenCalled();
    });

    it('should use empty string when pendingQuestionId is null', async () => {
      const session = createMockSession({ pendingQuestionId: null });
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(false);

      await handler.recordSelection(session, 'opt-1');

      expect(session.selectedOptions[0].promptId).toBe('');
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe('Edge Cases', () => {
    it('should handle session with no steps', async () => {
      const session = createMockSession({ steps: [], pendingQuestionId: null });
      mockSessionManager.getSession.mockResolvedValue(session);

      await expect(
        handler.handleResponse('test-session-001', 'prompt-1', 'opt-1'),
      ).rejects.toThrow('Prompt prompt-1 not found in session');
    });

    it('should handle session with single step', async () => {
      const session = createMockSession({
        steps: [
          {
            id: 'prompt-1',
            question: 'Single question?',
            sequence: 0,
            context: 'test',
            options: [{ id: 'opt-1', label: 'Only option', scopeTag: 'test' }],
          },
        ],
      });
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      await handler.handleResponse('test-session-001', 'prompt-1', 'opt-1');

      expect(session.selectedOptions).toHaveLength(1);
    });

    it('should handle option with special characters in ID', async () => {
      const session = createMockSession({
        steps: [
          {
            id: 'prompt-1',
            question: 'Question?',
            sequence: 0,
            context: 'test',
            options: [
              { id: 'opt-🎯', label: 'Special', scopeTag: 'test' },
              { id: 'opt-\n\t', label: 'Whitespace', scopeTag: 'test' },
            ],
          },
        ],
      });
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      await handler.handleResponse('test-session-001', 'prompt-1', 'opt-🎯');

      expect(session.selectedOptions[0].optionId).toBe('opt-🎯');
    });

    it('should preserve session ID and createdAt during selection', async () => {
      const session = createMockSession({
        id: 'immutable-id',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      await handler.handleResponse('test-session-001', 'prompt-1', 'opt-1');

      expect(session.id).toBe('immutable-id');
      expect(session.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should handle rapid successive selections', async () => {
      const session = createMockSession();
      mockSessionManager.getSession.mockResolvedValue(session);
      mockSessionManager.saveSession.mockResolvedValue(undefined);
      mockStateMachine.canTransition.mockReturnValue(true);

      await handler.handleResponse('test-session-001', 'prompt-1', 'opt-1');
      await handler.handleResponse('test-session-001', 'prompt-2', 'opt-3');

      expect(session.selectedOptions).toHaveLength(2);
      expect(session.selectedOptions[0].optionId).toBe('opt-1');
      expect(session.selectedOptions[1].optionId).toBe('opt-3');
    });

    it('should handle null or undefined parameters', async () => {
      await expect(
        handler.handleResponse(null as unknown as string, 'prompt-1', 'opt-1'),
      ).rejects.toThrow(InvalidSelectionError);
      await expect(
        handler.handleResponse('session-1', null as unknown as string, 'opt-1'),
      ).rejects.toThrow(InvalidSelectionError);
      await expect(
        handler.handleResponse('session-1', 'prompt-1', null as unknown as string),
      ).rejects.toThrow(InvalidSelectionError);
    });
  });
});
