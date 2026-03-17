import type { ClarificationSession } from '@clarityokr/contracts';

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
   * 更新会话步骤
   */
  async addStep(session: ClarificationSession, promptId: string, _sequence: number): Promise<void> {
    session.pendingQuestionId = promptId;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
  }

  /**
   * 记录选项选择
   */
  async recordSelection(session: ClarificationSession, optionId: string): Promise<void> {
    session.selectedOptionIds = [...session.selectedOptionIds, optionId];
    session.pendingQuestionId = null;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
  }

  /**
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
   * 重置所有会话状态（用于测试模式）
   */
  resetSessions(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    this.currentSessionId = null;
    Logger.info(`[SessionManager] All sessions cleared (${count} sessions)`);
  }

  /**
   * 获取所有会话（用于测试模式）
   */
  getAllSessions(): Map<string, ClarificationSession> {
    return new Map(this.sessions);
  }

  /**
   * 获取当前活动会话ID（用于测试模式）
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * 直接设置会话（用于测试模式）
   */
  setSession(sessionId: string, session: ClarificationSession): void {
    this.sessions.set(sessionId, session);
    this.currentSessionId = sessionId;
    Logger.info(`[SessionManager] Session ${sessionId} set manually`);
  }

  /**
   * 获取会话数量（用于测试模式）
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 获取会话（用于测试模式，返回undefined而非null）
   */
  async getSessionForTest(sessionId: string): Promise<ClarificationSession | undefined> {
    const session = await this.getSession(sessionId);
    return session ?? undefined;
  }
}
