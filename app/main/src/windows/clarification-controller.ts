import { randomUUID } from 'node:crypto';

import {
  clarificationOptionSelectionSchema,
  clarificationPromptRequestSchema,
  clarificationPromptResponseSchema,
  clarificationSessionSchema,
  generateOKRRequestSchema,
  generateOKRResponseSchema
} from '@clarityokr/contracts';
import type {
  ClarificationPrompt,
  ClarificationSession,
  KeyResult,
  OKRDocument,
  UserActionLogEntry
} from '@clarityokr/contracts';
import electron from 'electron';
import type { IpcMainEvent } from 'electron';

const { ipcMain, webContents } = electron;

import { IPCChannels } from '../bootstrap/ipc-channels.js';
import { ActionLogWriter } from '../persistence/action-log-writer.js';
import { OkrRepository } from '../persistence/okr-repository.js';
import { SessionRepository } from '../persistence/session-repository.js';
import { StickyWindowManager } from './sticky-window-manager.js';

interface ClarificationAgent {
  nextPrompt(intent: string, history: ClarificationPrompt[]): Promise<ClarificationPrompt>;
}

class StaticPromptAgent implements ClarificationAgent {
  nextPrompt(intent: string, history: ClarificationPrompt[]): Promise<ClarificationPrompt> {
    if (history.length === 0) {
      return Promise.resolve({
        id: randomUUID(),
        sequence: 0,
        question: '你希望澄清哪一方面的目标?',
        context: `初始意图: ${intent}`,
        options: [
          { id: 'scope', label: '聚焦范围', scopeTag: 'dimension' },
          { id: 'metric', label: '衡量指标', scopeTag: 'dimension' },
          { id: 'timeline', label: '时间范围', scopeTag: 'dimension' }
        ]
      });
    }

    return Promise.resolve({
      id: randomUUID(),
      sequence: history.length,
      question: '再补充一个细节, 让意图更清晰',
      context: '选择最关键的下一步',
      options: [
        { id: 'audience', label: '影响对象', scopeTag: 'detail' },
        { id: 'constraint', label: '主要约束', scopeTag: 'detail' }
      ]
    });
  }
}

export class ClarificationController {
  private readonly agent: ClarificationAgent = new StaticPromptAgent();

  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly okrRepository: OkrRepository,
    private readonly actionLogWriter: ActionLogWriter,
    private readonly stickyWindowManager: StickyWindowManager
  ) {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    ipcMain.handle(IPCChannels.CLARIFICATION_PROMPT, async (_event, payload) => {
      const request = clarificationPromptRequestSchema.parse(payload);
      const persisted = await this.sessionRepository.load();
      console.info('[main] prompt request received', {
        sessionId: request.sessionId,
        intent: request.intent,
        hasPersistedSession: Boolean(persisted.session)
      });

      const now = new Date().toISOString();
      const persistedSession =
        persisted.session && persisted.session.id === request.sessionId
          ? clarificationSessionSchema.parse(persisted.session)
          : null;

      const session: ClarificationSession = persistedSession ?? {
        id: request.sessionId,
        initialIntent: request.intent,
        status: 'collecting',
        createdAt: now,
        updatedAt: now,
        steps: [],
        selectedOptionIds: [],
        confidence: 0,
        pendingQuestionId: null
      };

      const nextPrompt = await this.agent.nextPrompt(request.intent, session.steps);
      session.steps = [...session.steps, nextPrompt];
      session.pendingQuestionId = nextPrompt.id;
      session.updatedAt = new Date().toISOString();

      await this.sessionRepository.saveSession(session);
      void this.logAction({
        actionType: 'generate',
        sessionId: session.id,
        okrId: null,
        payloadSummary: `prompt:${nextPrompt.id}`
      }).catch((error) => {
        console.error('Failed to record generate action', error);
      });

      console.info('[main] prompt resolved', { promptId: nextPrompt.id, sequence: nextPrompt.sequence });
      return clarificationPromptResponseSchema.parse({ prompt: nextPrompt });
    });

    ipcMain.on(IPCChannels.CLARIFICATION_RESPOND, (event, payload) => {
      void this.handleResponse(event, payload);
    });

    ipcMain.handle(IPCChannels.OKR_GENERATE, async (_event, payload) => {
      const request = generateOKRRequestSchema.parse(payload);
      const persisted = await this.sessionRepository.load();
      const sessionCandidate = persisted.session;
      if (!sessionCandidate || sessionCandidate.id !== request.sessionId) {
        throw new Error('No active session found for OKR generation.');
      }

      const session = clarificationSessionSchema.parse(sessionCandidate);
      const okr = this.buildOkrDocument(session, request.intentSummary);

      console.info('[main] generating OKR document', {
        sessionId: session.id,
        okrId: okr.id
      });

      session.status = 'completed';
      session.updatedAt = okr.generatedAt;
      session.pendingQuestionId = null;
      session.confidence = Math.max(session.confidence, 0.9);

      await this.sessionRepository.saveSession(session);
      await this.okrRepository.save(okr);

      await this.logAction({
        actionType: 'generate',
        sessionId: session.id,
        okrId: okr.id,
        payloadSummary: `okr:${okr.id}`
      });

      await this.stickyWindowManager.open(okr);

      return generateOKRResponseSchema.parse({ okr, session });
    });

    ipcMain.handle(IPCChannels.STICKY_REOPEN, async () => {
      const okr = await this.okrRepository.loadLatest();
      if (!okr) {
        return { success: false };
      }

      await this.stickyWindowManager.open(okr);
      return { success: true };
    });

    ipcMain.handle(IPCChannels.OKR_LATEST, async () => {
      const okr = await this.okrRepository.loadLatest();
      return okr ?? null;
    });
  }

  private async logAction(entry: Omit<UserActionLogEntry, 'id' | 'occurredAt'>): Promise<void> {
    const action: UserActionLogEntry = {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      ...entry
    };

    await this.actionLogWriter.append(action);
  }

  private async handleResponse(event: IpcMainEvent, payload: unknown): Promise<void> {
    const response = clarificationOptionSelectionSchema.parse(payload);
    const persisted = await this.sessionRepository.load();
    const sessionCandidate = persisted.session;
    if (!sessionCandidate) {
      throw new Error('Cannot record selection without an active clarification session.');
    }

    const session = clarificationSessionSchema.parse(sessionCandidate);

    session.selectedOptionIds = [...session.selectedOptionIds, response.optionId];
    session.pendingQuestionId = null;
    session.updatedAt = new Date().toISOString();

    await this.sessionRepository.saveSession(session);
    void this.logAction({
      actionType: 'edit',
      sessionId: session.id,
      okrId: null,
      payloadSummary: `selected:${response.optionId}`
    }).catch((error) => {
      console.error('Failed to record selection action', error);
    });

    const nextPrompt = await this.agent.nextPrompt(session.initialIntent, session.steps);
    session.steps.push(nextPrompt);
    session.pendingQuestionId = nextPrompt.id;
    await this.sessionRepository.saveSession(session);

    const targetContents = webContents.fromId(event.sender.id);
    targetContents?.send(IPCChannels.CLARIFICATION_PROMPT, {
      prompt: nextPrompt
    });
    console.info('[main] emitted follow-up prompt', {
      sessionId: session.id,
      promptId: nextPrompt.id,
      sequence: nextPrompt.sequence
    });
    void this.logAction({
      actionType: 'generate',
      sessionId: session.id,
      okrId: null,
      payloadSummary: `prompt:${nextPrompt.id}`
    }).catch((error) => {
      console.error('Failed to record follow-up prompt', error);
    });
  }

  private buildOkrDocument(session: ClarificationSession, intentSummary: string): OKRDocument {
    const generatedAt = new Date().toISOString();

    const objective = `围绕“${intentSummary}”提升执行成效`;
    const keyResults = this.createKeyResults(intentSummary);

    return {
      id: randomUUID(),
      objective,
      keyResults,
      sourceSessionId: session.id,
      generatedAt,
      lastEditedAt: null,
      regenerationPolicy: 'append',
      manualEdits: []
    } satisfies OKRDocument;
  }

  private createKeyResults(intentSummary: string): KeyResult[] {
    return [
      {
        id: randomUUID(),
        statement: `为“${intentSummary}”设定可衡量的流程节奏`,
        successMetric: '每周复盘 1 次',
        owner: '团队负责人'
      },
      {
        id: randomUUID(),
        statement: `建立 ${intentSummary} 成果指标追踪`,
        successMetric: '关键指标提升 15%',
        owner: undefined
      }
    ];
  }
}
