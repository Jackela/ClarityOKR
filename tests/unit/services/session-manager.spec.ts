import { jest } from '@jest/globals';
import { SessionManager } from '../../../app/main/src/services/session-manager.service.js';
import type { SessionRepository } from '../../../app/main/src/persistence/session-repository.js';
import type { ClarificationSession } from '@clarityokr/contracts';

describe('SessionManager Unit Tests', () => {
  let sessionManager: SessionManager;
  let mockSessionRepository: jest.Mocked<SessionRepository>;

  beforeEach(() => {
    // 任务19.3: SessionManager单元测试
    mockSessionRepository = {
      load: jest.fn(),
      saveSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SessionRepository>;

    sessionManager = new SessionManager(mockSessionRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
    sessionManager.resetSessions();
  });

  describe('createSession', () => {
    it('should create a new session with correct initial state', () => {
      const sessionId = 'test-session-1';
      const intent = 'Improve team productivity';

      const session = sessionManager.createSession(sessionId, intent);

      expect(session.id).toBe(sessionId);
      expect(session.initialIntent).toBe(intent);
      expect(session.status).toBe('collecting');
      expect(session.steps).toEqual([]);
      expect(session.selectedOptionIds).toEqual([]);
      expect(session.confidence).toBe(0);
      expect(session.pendingQuestionId).toBeNull();
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
    });

    it('should store created session in memory cache', () => {
      const sessionId = 'test-session-2';
      const intent = 'Reduce bugs';

      sessionManager.createSession(sessionId, intent);
      const retrieved = sessionManager.getAllSessions().get(sessionId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.initialIntent).toBe(intent);
    });
  });

  describe('getSession', () => {
    it('should return session from memory cache if available', async () => {
      const sessionId = 'cached-session';
      const session = sessionManager.createSession(sessionId, 'Test intent');

      const result = await sessionManager.getSession(sessionId);

      expect(result).toEqual(session);
      expect(mockSessionRepository.load).not.toHaveBeenCalled();
    });

    it('should load from persistence if not in cache', async () => {
      const sessionId = 'persisted-session';
      const persistedSession: ClarificationSession = {
        id: sessionId,
        initialIntent: 'Persisted intent',
        status: 'collecting',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: [],
        selectedOptionIds: [],
        confidence: 0.5,
        pendingQuestionId: null,
      };

      mockSessionRepository.load.mockResolvedValue({ session: persistedSession });

      const result = await sessionManager.getSession(sessionId);

      expect(result).toEqual(persistedSession);
      expect(mockSessionRepository.load).toHaveBeenCalledTimes(1);
    });

    it('should return null if session not found anywhere', async () => {
      const sessionId = 'nonexistent-session';
      mockSessionRepository.load.mockResolvedValue({ session: null });

      const result = await sessionManager.getSession(sessionId);

      expect(result).toBeNull();
    });

    // 任务19.6: 负面测试 - 会话ID不匹配
    it('should return null if persisted session ID does not match requested ID', async () => {
      const requestedId = 'requested-id';
      const differentSession: ClarificationSession = {
        id: 'different-id',
        initialIntent: 'Different',
        status: 'collecting',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: [],
        selectedOptionIds: [],
        confidence: 0,
        pendingQuestionId: null,
      };

      mockSessionRepository.load.mockResolvedValue({ session: differentSession });

      const result = await sessionManager.getSession(requestedId);

      expect(result).toBeNull();
    });
  });

  describe('saveSession', () => {
    it('should save session to memory and persistence', async () => {
      const session = sessionManager.createSession('save-test', 'Save me');

      await sessionManager.saveSession(session);

      expect(mockSessionRepository.saveSession).toHaveBeenCalledWith(session);
      expect(sessionManager.getCurrentSessionId()).toBe('save-test');
    });

    // 任务19.6: 负面测试 - 保存失败
    it('should throw error if persistence fails', async () => {
      const session = sessionManager.createSession('fail-test', 'Fail me');
      mockSessionRepository.saveSession.mockRejectedValue(new Error('Disk full'));

      await expect(sessionManager.saveSession(session)).rejects.toThrow('Disk full');
    });
  });

  describe('addStep', () => {
    it('should add step and update session metadata', async () => {
      const session = sessionManager.createSession('step-test', 'Add step');
      const oldUpdatedAt = session.updatedAt;

      await sessionManager.addStep(session, 'prompt-1', 0);

      expect(session.pendingQuestionId).toBe('prompt-1');
      expect(session.updatedAt).not.toBe(oldUpdatedAt);
      expect(mockSessionRepository.saveSession).toHaveBeenCalledWith(session);
    });
  });

  describe('recordSelection', () => {
    it('should record option selection and update session', async () => {
      const session = sessionManager.createSession('selection-test', 'Record selection');

      await sessionManager.recordSelection(session, 'option-1');

      expect(session.selectedOptionIds).toContain('option-1');
      expect(session.pendingQuestionId).toBeNull();
      expect(mockSessionRepository.saveSession).toHaveBeenCalled();
    });

    it('should accumulate multiple selections', async () => {
      const session = sessionManager.createSession('multi-selection', 'Multiple');

      await sessionManager.recordSelection(session, 'opt-1');
      await sessionManager.recordSelection(session, 'opt-2');
      await sessionManager.recordSelection(session, 'opt-3');

      expect(session.selectedOptionIds).toEqual(['opt-1', 'opt-2', 'opt-3']);
    });
  });

  describe('completeSession', () => {
    it('should mark session as completed', async () => {
      const session = sessionManager.createSession('complete-test', 'Complete me');
      session.confidence = 0.5;

      await sessionManager.completeSession(session);

      expect(session.status).toBe('completed');
      expect(session.pendingQuestionId).toBeNull();
      expect(session.confidence).toBe(0.9); // Should be at least 0.9
    });

    it('should not lower existing high confidence', async () => {
      const session = sessionManager.createSession('high-confidence', 'High conf');
      session.confidence = 0.95;

      await sessionManager.completeSession(session);

      expect(session.confidence).toBe(0.95);
    });
  });

  describe('resetSessions (TestMode)', () => {
    it('should clear all sessions', () => {
      sessionManager.createSession('session-1', 'First');
      sessionManager.createSession('session-2', 'Second');
      expect(sessionManager.getSessionCount()).toBe(2);

      sessionManager.resetSessions();

      expect(sessionManager.getSessionCount()).toBe(0);
      expect(sessionManager.getCurrentSessionId()).toBeNull();
    });
  });

  describe('TestMode API', () => {
    it('getAllSessions should return copy of sessions map', () => {
      sessionManager.createSession('test-1', 'Test');

      const sessions = sessionManager.getAllSessions();
      sessions.clear(); // Should not affect internal state

      expect(sessionManager.getSessionCount()).toBe(1);
    });

    it('setSession should set session directly', () => {
      const session: ClarificationSession = {
        id: 'manual-session',
        initialIntent: 'Manual',
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: [],
        selectedOptionIds: ['opt-1'],
        confidence: 0.8,
        pendingQuestionId: null,
      };

      sessionManager.setSession('manual-session', session);

      expect(sessionManager.getCurrentSessionId()).toBe('manual-session');
      expect(sessionManager.getAllSessions().get('manual-session')).toEqual(session);
    });
  });

  // 任务19.7: 边界条件测试
  describe('边界条件', () => {
    it('should handle empty intent string', () => {
      const session = sessionManager.createSession('empty-intent', '');
      expect(session.initialIntent).toBe('');
    });

    it('should handle very long intent string', () => {
      const longIntent = 'a'.repeat(10000);
      const session = sessionManager.createSession('long-intent', longIntent);
      expect(session.initialIntent).toBe(longIntent);
    });

    it('should handle special characters in intent', () => {
      const specialIntent = '!@#$%^&*()_+<>?"{}|\\';
      const session = sessionManager.createSession('special-intent', specialIntent);
      expect(session.initialIntent).toBe(specialIntent);
    });

    it('should handle unicode characters in intent', () => {
      const unicodeIntent = '🎯 目标：提高效率 日本語 العربية';
      const session = sessionManager.createSession('unicode-intent', unicodeIntent);
      expect(session.initialIntent).toBe(unicodeIntent);
    });
  });
});
