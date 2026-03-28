/**
 * SessionManager - Session lifecycle management (legacy service)
 *
 * Responsibilities:
 * - Creates and manages clarification sessions
 * - Retrieves sessions from memory cache or persistent storage
 * - Saves session state to both memory and database
 * - Provides test mode APIs for session manipulation
 *
 * @deprecated Use ClarificationSessionManager from clarification/ module instead
 */

import { Logger } from '../core/logger.js';
import type { SessionRepository } from '../persistence/session-repository.js';

/**
 * SessionManager - 会话生命周期管理
 * 职责：统一管理会话的创建、获取、保存和重置
 */
export class SessionManager {
  private readonly sessions = new Map<string, ClarificationSession>();
  private currentSessionId: string | null = null;

  constructor(private readonly sessionRepository: SessionRepository) {}

  /**
   * Gets a session by ID, checking memory cache first then persistent storage.
   *
   * @param sessionId - The session identifier to retrieve
   * @returns Promise resolving to the session or null if not found
   */
   * 从内存缓存或持久化存储中获取会话
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
      return session;
    }

    return null;
  }

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
    return session;
  }

  /**
   * Saves a session to both memory cache and persistent storage.
   *
   * @param session - The session to save
   * @returns Promise that resolves when saved
   */
   * 保存会话到内存和持久化存储
   */
  async saveSession(session: ClarificationSession): Promise<void> {
    // 更新内存缓存
    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;

    // 同步到持久化存储
    await this.sessionRepository.saveSession(session);

    Logger.info(`[SessionManager] Session ${session.id} saved to memory and persistence`);
  }

  /**
   * Updates session with a new prompt step.
   *
   * @param session - The session to update
   * @param promptId - ID of the prompt being added
   * @param _sequence - Sequence number of the step (unused)
   * @returns Promise that resolves when updated
   */
   * 更新会话步骤
   */
  async addStep(session: ClarificationSession, promptId: string, _sequence: number): Promise<void> {
    session.pendingQuestionId = promptId;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
  }

  /**
   * Records a user option selection in the session.
   *
   * @param session - The session to update
   * @param optionId - ID of the selected option
   * @returns Promise that resolves when recorded
   */
   * 记录选项选择
   */
  async recordSelection(session: ClarificationSession, optionId: string): Promise<void> {
    session.selectedOptionIds = [...session.selectedOptionIds, optionId];
    session.pendingQuestionId = null;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
  }

  /**
   * Marks a session as completed.
   *
   * @param session - The session to complete
   * @returns Promise that resolves when completed
   */
   * 完成会话
   */
  async completeSession(session: ClarificationSession): Promise<void> {
    session.status = 'completed';
    session.updatedAt = new Date().toISOString();
    session.pendingQuestionId = null;
    session.confidence = Math.max(session.confidence, 0.9);
    await this.saveSession(session);
  }

  /**
   * Loads a session from persistent storage into memory cache.
   *
   * @returns Promise resolving to the loaded session or null
   */
   * 从持久化存储加载会话到内存
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

  // ==================== TestMode API Support ====================

  /**
   * Clears all in-memory sessions (used for testing).
   */

  /**
   * 重置所有会话状态（用于测试模式）
   */
  resetSessions(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    this.currentSessionId = null;
    Logger.info(`[SessionManager] All sessions cleared (${count} sessions)`);
  }

  /**
   * Gets all active sessions as a Map (used for testing).
   *
   * @returns Map of session IDs to session objects
   */
   * 获取所有会话（用于测试模式）
   */
  getAllSessions(): Map<string, ClarificationSession> {
    return new Map(this.sessions);
  }

  /**
   * Gets the currently active session ID (used for testing).
   *
   * @returns Current session ID or null
   */
   * 获取当前活动会话ID（用于测试模式）
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
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
   * Gets the count of active in-memory sessions (used for testing).
   *
   * @returns Number of sessions
   */
   * 获取会话数量（用于测试模式）
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Gets a session for testing (returns undefined instead of null).
   *
   * @param sessionId - The session ID to retrieve
   * @returns Promise resolving to the session or undefined
   */
   * 获取会话（用于测试模式，返回undefined而非null）
   */
  async getSessionForTest(sessionId: string): Promise<ClarificationSession | undefined> {
    const session = await this.getSession(sessionId);
    return session ?? undefined;
  }
}
