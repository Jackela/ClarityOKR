import { jest } from '@jest/globals';
import type { SessionManager } from '@clarityokr/main/services/session-manager.service';
import type { OkrRepository } from '@clarityokr/main/persistence/okr-repository';
import type { StickyWindowManager } from '@clarityokr/main/windows/sticky-window-manager';
import { OkrGenerateHandler } from '@clarityokr/main/clarification/clarification-draft-handler';
import type { ClarificationSession } from '@clarityokr/contracts';

describe('OkrGenerateHandler', () => {
  let handler: OkrGenerateHandler;
  let mockSessionManager: jest.Mocked<SessionManager>;
  let mockOkrRepository: jest.Mocked<OkrRepository>;
  let mockStickyWindowManager: jest.Mocked<StickyWindowManager>;

  beforeEach(() => {
    mockSessionManager = {
      getSession: jest.fn(),
      completeSession: jest.fn(),
    } as unknown as jest.Mocked<SessionManager>;

    mockOkrRepository = {
      save: jest.fn(),
    } as unknown as jest.Mocked<OkrRepository>;

    mockStickyWindowManager = {
      open: jest.fn(),
    } as unknown as jest.Mocked<StickyWindowManager>;

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

    mockSessionManager.getSession.mockResolvedValue(session);
    mockSessionManager.completeSession.mockResolvedValue(undefined);
    mockOkrRepository.save.mockResolvedValue(undefined);
    mockStickyWindowManager.open.mockResolvedValue(undefined);

    const result = await handler.handle({
      sessionId: 'session-1',
      intentSummary: 'Improve productivity',
    });

    expect(result.okr).toBeDefined();
    expect(result.okr.objective).toContain('Improve productivity');
    expect(result.okr.keyResults).toHaveLength(2);
    expect(mockSessionManager.completeSession).toHaveBeenCalledWith(session);
    expect(mockOkrRepository.save).toHaveBeenCalled();
    expect(mockStickyWindowManager.open).toHaveBeenCalled();
  });

  it('should throw error when session not found', async () => {
    mockSessionManager.getSession.mockResolvedValue(null);

    await expect(
      handler.handle({
        sessionId: 'nonexistent',
        intentSummary: 'Test',
      }),
    ).rejects.toThrow('No active session found for OKR generation.');
  });
});
