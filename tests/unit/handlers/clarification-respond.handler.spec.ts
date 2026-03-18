import type { SessionManager } from '../../../app/main/src/services/session-manager.service.js';
import { ClarificationRespondHandler } from '../../../app/main/src/handlers/clarification-respond.handler.js';
import type { ClarificationSession } from '@clarityokr/contracts';

describe('ClarificationRespondHandler', () => {
  let handler: ClarificationRespondHandler;
  let mockSessionManager: jasmine.SpyObj<SessionManager>;

  beforeEach(() => {
    mockSessionManager = jasmine.createSpyObj('SessionManager', ['getSession', 'recordSelection']);
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

    mockSessionManager.getSession.and.returnValue(Promise.resolve(session));
    mockSessionManager.recordSelection.and.returnValue(Promise.resolve());

    await handler.handle({
      sessionId: 'session-1',
      promptId: 'prompt-1',
      optionId: 'option-1',
    });

    expect(mockSessionManager.getSession).toHaveBeenCalledWith('session-1');
    expect(mockSessionManager.recordSelection).toHaveBeenCalledWith(session, 'option-1');
  });

  it('should throw error when session not found', async () => {
    mockSessionManager.getSession.and.returnValue(Promise.resolve(null));

    await expectAsync(
      handler.handle({
        sessionId: 'nonexistent',
        promptId: 'prompt-1',
        optionId: 'option-1',
      }),
    ).toBeRejectedWithError('Cannot record selection without an active clarification session.');
  });
});
