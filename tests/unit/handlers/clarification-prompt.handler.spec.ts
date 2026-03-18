import type { SessionManager } from '../../../app/main/src/services/session-manager.service.js';
import { ClarificationPromptHandler } from '../../../app/main/src/handlers/clarification-prompt.handler.js';
import type { OkrAgentService } from '../../../app/main/src/services/okr-agent.service.js';
import type { ClarificationSession } from '@clarityokr/contracts';

describe('ClarificationPromptHandler', () => {
  let handler: ClarificationPromptHandler;
  let mockSessionManager: jasmine.SpyObj<SessionManager>;
  let mockOkrAgentService: jasmine.SpyObj<OkrAgentService>;

  beforeEach(() => {
    mockSessionManager = jasmine.createSpyObj('SessionManager', [
      'getSession',
      'createSession',
      'addStep',
    ]);
    mockOkrAgentService = jasmine.createSpyObj('OkrAgentService', ['getNextQuestion']);

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

      mockSessionManager.getSession.and.returnValue(Promise.resolve(null));
      mockSessionManager.createSession.and.returnValue(mockSession);
      mockSessionManager.addStep.and.returnValue(Promise.resolve());
      mockOkrAgentService.getNextQuestion.and.returnValue(
        Promise.resolve({
          question: {
            id: 'q1',
            text: 'Test question?',
            options: [
              { id: 'opt1', label: 'Option 1' },
              { id: 'opt2', label: 'Option 2' },
            ],
          },
        }),
      );

      const result = await handler.handle({
        sessionId: 'session-1',
        intent: 'Test intent',
      });

      expect(mockSessionManager.createSession).toHaveBeenCalledWith('session-1', 'Test intent');
      expect(result.prompt.id).toBe('q1');
      expect(result.prompt.question).toBe('Test question?');
      expect(result.prompt.options).toHaveSize(2);
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

      mockSessionManager.getSession.and.returnValue(Promise.resolve(existingSession));
      mockSessionManager.addStep.and.returnValue(Promise.resolve());
      mockOkrAgentService.getNextQuestion.and.returnValue(
        Promise.resolve({
          question: {
            id: 'q2',
            text: 'Another question?',
            options: [{ id: 'opt1', label: 'Yes' }],
          },
        }),
      );

      const result = await handler.handle({
        sessionId: 'session-2',
        intent: 'New intent', // Should be ignored, existing session used
      });

      expect(mockSessionManager.createSession).not.toHaveBeenCalled();
      expect(result.prompt.id).toBe('q2');
    });

    it('should throw error when LLM service fails', async () => {
      mockSessionManager.getSession.and.returnValue(Promise.resolve(null));
      mockSessionManager.createSession.and.returnValue({
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
      mockOkrAgentService.getNextQuestion.and.returnValue(Promise.reject(new Error('LLM timeout')));

      await expectAsync(
        handler.handle({
          sessionId: 'session-3',
          intent: 'Test',
        }),
      ).toBeRejectedWithError('Failed to generate clarification prompt: LLM timeout');
    });

    it('should throw error for empty response', async () => {
      mockSessionManager.getSession.and.returnValue(Promise.resolve(null));
      mockSessionManager.createSession.and.returnValue({
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
      mockOkrAgentService.getNextQuestion.and.returnValue(Promise.resolve(null));

      await expectAsync(
        handler.handle({
          sessionId: 'session-4',
          intent: 'Test',
        }),
      ).toBeRejectedWithError('Empty or invalid response from LLM service');
    });

    it('should throw error for response missing question fields', async () => {
      mockSessionManager.getSession.and.returnValue(Promise.resolve(null));
      mockSessionManager.createSession.and.returnValue({
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
      mockOkrAgentService.getNextQuestion.and.returnValue(
        Promise.resolve({
          question: { text: 'Missing id' }, // Missing id and options
        }),
      );

      await expectAsync(
        handler.handle({
          sessionId: 'session-5',
          intent: 'Test',
        }),
      ).toBeRejectedWithError('LLM response missing required question fields');
    });
  });
});
