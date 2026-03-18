import type { SessionManager } from '../../../app/main/src/services/session-manager.service.js';
import type { OkrRepository } from '../../../app/main/src/persistence/okr-repository.js';
import type { StickyWindowManager } from '../../../app/main/src/windows/sticky-window-manager.js';
import { OkrGenerateHandler } from '../../../app/main/src/handlers/okr-generate.handler.js';
import type { ClarificationSession, OKRDocument } from '@clarityokr/contracts';

describe('OkrGenerateHandler', () => {
  let handler: OkrGenerateHandler;
  let mockSessionManager: jasmine.SpyObj<SessionManager>;
  let mockOkrRepository: jasmine.SpyObj<OkrRepository>;
  let mockStickyWindowManager: jasmine.SpyObj<StickyWindowManager>;

  beforeEach(() => {
    mockSessionManager = jasmine.createSpyObj('SessionManager', ['getSession', 'completeSession']);
    mockOkrRepository = jasmine.createSpyObj('OkrRepository', ['save']);
    mockStickyWindowManager = jasmine.createSpyObj('StickyWindowManager', ['open']);

    handler = new OkrGenerateHandler(
      mockSessionManager,
      mockOkrRepository,
      mockStickyWindowManager,
    );
  });

  it('should generate OKR, complete session and open window', async () => {
    const session: ClarificationSession = {
      id: 'session-1',
      initialIntent: 'Improve productivity',
      status: 'collecting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      selectedOptionIds: ['opt1', 'opt2'],
      confidence: 0.85,
      pendingQuestionId: null,
    };

    mockSessionManager.getSession.and.returnValue(Promise.resolve(session));
    mockSessionManager.completeSession.and.returnValue(Promise.resolve());
    mockOkrRepository.save.and.returnValue(Promise.resolve());
    mockStickyWindowManager.open.and.returnValue(Promise.resolve());

    const result = await handler.handle({
      sessionId: 'session-1',
      intentSummary: 'Improve productivity',
    });

    expect(result.okr).toBeDefined();
    expect(result.okr.objective).toContain('Improve productivity');
    expect(result.okr.keyResults).toHaveSize(2);
    expect(mockSessionManager.completeSession).toHaveBeenCalledWith(session);
    expect(mockOkrRepository.save).toHaveBeenCalled();
    expect(mockStickyWindowManager.open).toHaveBeenCalled();
  });

  it('should throw error when session not found', async () => {
    mockSessionManager.getSession.and.returnValue(Promise.resolve(null));

    await expectAsync(
      handler.handle({
        sessionId: 'nonexistent',
        intentSummary: 'Test',
      }),
    ).toBeRejectedWithError('No active session found for OKR generation.');
  });
});
