import type { ClarificationSession } from '@clarityokr/contracts';

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
   * 清理所有会话
   */
  cleanupSessions(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    this.currentSessionId = null;
    Logger.info(`[SessionManager] All sessions cleared (${count} sessions)`);
  }

  /**
   * 获取所有会话
   */
  getAllSessions(): Map<string, ClarificationSession> {
    return new Map(this.sessions);
  }

  /**
   * 获取当前会话ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * 获取会话数量
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 保存会话到持久化存储
   */
  async saveSession(session: ClarificationSession): Promise<void> {
    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;
    await this.sessionRepository.saveSession(session);
    Logger.info(`[SessionManager] Session ${session.id} saved`);
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
