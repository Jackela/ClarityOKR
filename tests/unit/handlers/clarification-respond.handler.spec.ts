import { jest } from '@jest/globals';
import type { SessionManager } from '@clarityokr/main/services/session-manager.service';
import { ClarificationRespondHandler } from '@clarityokr/main/handlers/clarification-respond.handler';
import type { ClarificationSession } from '@clarityokr/contracts';

describe('ClarificationRespondHandler', () => {
  let handler: ClarificationRespondHandler;
  let mockSessionManager: jest.Mocked<SessionManager>;

  beforeEach(() => {
    mockSessionManager = {
      getSession: jest.fn(),
      recordSelection: jest.fn(),
    } as unknown as jest.Mocked<SessionManager>;

    handler = new ClarificationRespondHandler(mockSessionManager);
  });

  it('should record selection for valid session', async () => {
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

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.recordSelection.mockResolvedValue(undefined);

    await handler.handle({
      sessionId: 'session-1',
      promptId: 'prompt-1',
      optionId: 'option-1',
    });

    expect(mockSessionManager.getSession).toHaveBeenCalledWith('session-1');
    expect(mockSessionManager.recordSelection).toHaveBeenCalledWith(session, 'option-1');
  });

  it('should throw error when session not found', async () => {
    mockSessionManager.getSession.mockResolvedValue(null);

    await expect(
      handler.handle({
        sessionId: 'nonexistent',
        promptId: 'prompt-1',
        optionId: 'option-1',
      }),
    ).rejects.toThrow('Cannot record selection without an active clarification session.');
  });
});
