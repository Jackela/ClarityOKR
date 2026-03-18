import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import type { ClarificationSession, OKRDocument, UserActionLogEntry } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import { ensureDataDir, readEncryptedJson, writeEncryptedJson } from './encrypted-persistence.js';

export interface PersistedState {
  session: ClarificationSession | null;
  okr: OKRDocument | null;
  actions: UserActionLogEntry[];
}

export interface MultiSessionState {
  sessions: Record<string, ClarificationSession>;
  okrs: Record<string, OKRDocument>;
  actions: Record<string, UserActionLogEntry[]>;
  activeSessionId: string | null;
}

export class SessionRepository {
  private readonly dataDir: string;
  private readonly sessionFile: string;
  private readonly okrFile: string;
  private readonly actionLogFile: string;
  private readonly multiSessionFile: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? join(process.cwd(), 'data');
    this.sessionFile = join(this.dataDir, 'clarification-session.json');
    this.okrFile = join(this.dataDir, 'okr-document.json');
    this.actionLogFile = join(this.dataDir, 'action-log.json');
    this.multiSessionFile = join(this.dataDir, 'multi-sessions.json');
  }

  async load(): Promise<PersistedState> {
    await ensureDataDir(this.dataDir);

    try {
      const [session, okr, actions] = await Promise.all([
        readEncryptedJson<ClarificationSession>(this.sessionFile),
        readEncryptedJson<OKRDocument>(this.okrFile),
        readEncryptedJson<UserActionLogEntry[]>(this.actionLogFile),
      ]);

      return {
        session,
        okr,
        actions: actions ?? [],
      };
    } catch (error) {
      Logger.error('[SessionRepository] Failed to load state', error);
      return { session: null, okr: null, actions: [] };
    }
  }

  async saveSession(session: ClarificationSession | null): Promise<void> {
    await ensureDataDir(this.dataDir);

    try {
      if (session) {
        await writeEncryptedJson(this.sessionFile, session);
      } else {
        await fs.rm(this.sessionFile, { force: true });
      }
    } catch (error) {
      Logger.error('[SessionRepository] Failed to save session', error);
      throw error;
    }
  }

  async saveOKRDocument(document: OKRDocument | null): Promise<void> {
    await ensureDataDir(this.dataDir);

    try {
      if (document) {
        await writeEncryptedJson(this.okrFile, document);
      } else {
        await fs.rm(this.okrFile, { force: true });
      }
    } catch (error) {
      Logger.error('[SessionRepository] Failed to save OKR document', error);
      throw error;
    }
  }

  async appendActionLog(entry: UserActionLogEntry): Promise<void> {
    await ensureDataDir(this.dataDir);

    try {
      const current = (await readEncryptedJson<UserActionLogEntry[]>(this.actionLogFile)) ?? [];
      current.push(entry);
      await writeEncryptedJson(this.actionLogFile, current);
    } catch (error) {
      Logger.error('[SessionRepository] Failed to append action log', error);
      throw error;
    }
  }

  async replaceActionLog(entries: UserActionLogEntry[]): Promise<void> {
    await ensureDataDir(this.dataDir);

    try {
      await writeEncryptedJson(this.actionLogFile, entries);
    } catch (error) {
      Logger.error('[SessionRepository] Failed to replace action log', error);
      throw error;
    }
  }

  // ========== 多会话支持（新增方法） ==========

  /**
   * 加载多会话状态
   * @returns 所有会话的状态
   */
  async loadMultiSessionState(): Promise<MultiSessionState> {
    await ensureDataDir(this.dataDir);

    try {
      const state = await readEncryptedJson<MultiSessionState>(this.multiSessionFile);

      if (!state) {
        // 如果没有多会话状态，尝试从旧格式迁移
        const legacyState = await this.load();
        if (legacyState.session) {
          return {
            sessions: { [legacyState.session.id]: legacyState.session },
            okrs: legacyState.okr ? { [legacyState.session.id]: legacyState.okr } : {},
            actions: legacyState.session ? { [legacyState.session.id]: legacyState.actions } : {},
            activeSessionId: legacyState.session.id,
          };
        }

        return {
          sessions: {},
          okrs: {},
          actions: {},
          activeSessionId: null,
        };
      }

      return state;
    } catch (error) {
      Logger.error('[SessionRepository] Failed to load multi-session state', error);
      return {
        sessions: {},
        okrs: {},
        actions: {},
        activeSessionId: null,
      };
    }
  }

  /**
   * 保存多会话状态
   * @param state - 要保存的状态
   */
  async saveMultiSessionState(state: MultiSessionState): Promise<void> {
    await ensureDataDir(this.dataDir);

    try {
      await writeEncryptedJson(this.multiSessionFile, state);
    } catch (error) {
      Logger.error('[SessionRepository] Failed to save multi-session state', error);
      throw error;
    }
  }

  /**
   * 获取特定会话
   * @param sessionId - 会话ID
   * @returns 会话数据
   */
  async getSession(sessionId: string): Promise<ClarificationSession | null> {
    const state = await this.loadMultiSessionState();
    return state.sessions[sessionId] ?? null;
  }

  /**
   * 保存会话
   * @param session - 要保存的会话
   */
  async saveSessionMulti(session: ClarificationSession): Promise<void> {
    const state = await this.loadMultiSessionState();
    state.sessions[session.id] = session;
    state.activeSessionId = session.id;
    await this.saveMultiSessionState(state);
  }

  /**
   * 获取特定会话的OKR
   * @param sessionId - 会话ID
   * @returns OKR文档
   */
  async getOKR(sessionId: string): Promise<OKRDocument | null> {
    const state = await this.loadMultiSessionState();
    return state.okrs[sessionId] ?? null;
  }

  /**
   * 保存OKR
   * @param sessionId - 关联的会话ID
   * @param okr - OKR文档
   */
  async saveOKRMulti(sessionId: string, okr: OKRDocument): Promise<void> {
    const state = await this.loadMultiSessionState();
    state.okrs[sessionId] = okr;
    await this.saveMultiSessionState(state);
  }

  /**
   * 获取所有会话列表
   * @returns 会话数组
   */
  async getAllSessions(): Promise<ClarificationSession[]> {
    const state = await this.loadMultiSessionState();
    return Object.values(state.sessions);
  }

  /**
   * 删除会话
   * @param sessionId - 要删除的会话ID
   */
  async deleteSession(sessionId: string): Promise<void> {
    const state = await this.loadMultiSessionState();
    delete state.sessions[sessionId];
    delete state.okrs[sessionId];
    delete state.actions[sessionId];

    if (state.activeSessionId === sessionId) {
      const remainingIds = Object.keys(state.sessions);
      state.activeSessionId = remainingIds.length > 0 ? remainingIds[0] : null;
    }

    await this.saveMultiSessionState(state);
  }

  /**
   * 设置活动会话
   * @param sessionId - 活动会话ID
   */
  async setActiveSession(sessionId: string): Promise<void> {
    const state = await this.loadMultiSessionState();
    if (state.sessions[sessionId]) {
      state.activeSessionId = sessionId;
      await this.saveMultiSessionState(state);
    }
  }

  /**
   * 获取活动会话
   * @returns 活动会话ID
   */
  async getActiveSessionId(): Promise<string | null> {
    const state = await this.loadMultiSessionState();
    return state.activeSessionId;
  }
}
