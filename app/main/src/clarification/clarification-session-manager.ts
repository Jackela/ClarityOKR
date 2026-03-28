/**
 * ClarificationSessionManager - Session Lifecycle Management
 *
 * Responsibilities:
 * - Creates new clarification sessions with unique IDs
 * - Retrieves sessions from memory cache or persistent storage
 * - Saves session state to persistent storage
 * - Manages session status transitions (collecting -> ready -> completed)
 * - Provides test mode APIs for session manipulation
 *
 * Sessions are cached in memory for performance and persisted to SQLite
 * for durability across application restarts.
 */

import { Logger } from '../core/logger.js';
import type { SessionRepository } from '../persistence/session-repository.js';
import type { IClarificationSessionManager } from './interfaces/session-manager.interface.js';
import type { IClarificationStateMachine } from './interfaces/state-machine.interface.js';
import { SessionNotFoundError, StateTransitionError } from './types.js';

/**
 * ClarificationSessionManager - 会话生命周期管理
 * 职责：统一管理会话的创建、获取、保存和重置
 */
export class ClarificationSessionManager implements IClarificationSessionManager {
  private readonly sessions = new Map<string, ClarificationSession>();
  private currentSessionId: string | null = null;

  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly stateMachine: IClarificationStateMachine,
  ) {}

  /**
   * Creates a new clarification session.
   *
   * @param sessionId - Unique identifier for the session
   * @param initialIntent - The user's initial goal description
   * @returns The newly created clarification session
   */
   * 创建新会话
   */
  createSession(sessionId: string, initialIntent: string): ClarificationSession {
    const now = new Date().toISOString();
    const session: ClarificationSession = {
      id: sessionId,
      initialIntent,
      status: 'collecting',
      createdAt: now,
      updatedAt: now,
      steps: [],
      selectedOptionIds: [],
      confidence: 0,
      pendingQuestionId: null,
    };

    this.sessions.set(sessionId, session);
    this.currentSessionId = sessionId;

    Logger.info(`[SessionManager] Session ${sessionId} created`);
    return session;
  }

  /**
   * Gets a session by ID, checking memory cache first then persistent storage.
   *
   * @param sessionId - The session identifier to retrieve
   * @returns Promise resolving to the session or null if not found
   */
   * 获取会话（优先从内存，其次从持久化存储）
   */
  async getSession(sessionId: string): Promise<ClarificationSession | null> {
    // 先尝试内存缓存
    let session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }

    // 回退到持久化存储
    const persisted = await this.sessionRepository.load();
    if (persisted.session && persisted.session.id === sessionId) {
      session = persisted.session;
      this.sessions.set(sessionId, session);
      this.currentSessionId = sessionId;
      return session;
    }

    return null;
  }

  /**
   * Ends a session by marking it as completed.
   *
   * @param sessionId - The session to end
   * @returns Promise that resolves when session is ended
   * @throws {SessionNotFoundError} If session does not exist
   * @throws {StateTransitionError} If state transition is invalid
   */
   * 结束会话
   */
  async endSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // 验证并执行状态转换
    if (!this.stateMachine.canTransition(session.status, 'completed')) {
      throw new StateTransitionError(session.status, 'completed');
    }

    session.status = 'completed';
    session.confidence = Math.max(session.confidence, 0.9);
    session.pendingQuestionId = null;
    session.updatedAt = new Date().toISOString();

    // 保存到持久化存储
    await this.sessionRepository.saveSession(session);

    Logger.info(`[SessionManager] Session ${sessionId} ended`);
  }

  /**
   * Clears all in-memory sessions (used for testing).
   */
   * 清理所有会话
   */
  cleanupSessions(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    this.currentSessionId = null;
    Logger.info(`[SessionManager] All sessions cleared (${count} sessions)`);
  }

  /**
   * Gets all active sessions as a Map.
   *
   * @returns Map of session IDs to session objects
   */
   * 获取所有会话
   */
  getAllSessions(): Map<string, ClarificationSession> {
    return new Map(this.sessions);
  }

  /**
   * Gets the currently active session ID.
   *
   * @returns Current session ID or null if no active session
   */
   * 获取当前会话ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Gets the count of active in-memory sessions.
   *
   * @returns Number of active sessions
   */
   * 获取会话数量
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Saves a session to persistent storage and updates cache.
   *
   * @param session - The session to save
   * @returns Promise that resolves when saved
   */
   * 保存会话到持久化存储
   */
  async saveSession(session: ClarificationSession): Promise<void> {
    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;
    await this.sessionRepository.saveSession(session);
    Logger.info(`[SessionManager] Session ${session.id} saved`);
  }

  /**
   * Manually sets a session (used for testing).
   *
   * @param sessionId - The session ID
   * @param session - The session object to set
   */
   * 直接设置会话（用于测试模式）
   */
  setSession(sessionId: string, session: ClarificationSession): void {
    this.sessions.set(sessionId, session);
    this.currentSessionId = sessionId;
    Logger.info(`[SessionManager] Session ${sessionId} set manually`);
  }

  /**
   * Loads a session from persistent storage into memory.
   *
   * @returns Promise resolving to the loaded session or null
   */
   * 从持久化存储加载会话
   */
  async loadFromPersistence(): Promise<ClarificationSession | null> {
    const persisted = await this.sessionRepository.load();
    if (persisted.session) {
      const session = persisted.session;
      this.sessions.set(session.id, session);
      this.currentSessionId = session.id;
      return session;
    }
    return null;
  }
}
