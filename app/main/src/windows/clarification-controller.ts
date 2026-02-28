/* eslint-disable @typescript-eslint/consistent-type-imports, import/order */
import { randomUUID } from 'node:crypto';

import {
  clarificationOptionSelectionSchema,
  clarificationPromptRequestSchema,
  clarificationPromptResponseSchema,
  clarificationSessionSchema,
  generateOKRRequestSchema,
  generateOKRResponseSchema,
} from '@clarityokr/contracts';
import type {
  ClarificationPrompt,
  ClarificationSession,
  OKRDocument,
  UserActionLogEntry,
} from '@clarityokr/contracts';

import electron, { type IpcMainEvent } from 'electron';

import { IPCChannels } from '../bootstrap/ipc-channels.js';
import type {
  LlmNextQuestionRequest,
  LlmNextQuestionResponse,
  OkrDraftRequest,
  OkrDraftResponse,
} from '../main/ipc.llm.js';
import { LlmIntegrationService } from '../services/llm-integration.service.js';
import { OkrBuilderService } from '../services/okr-builder.service.js';
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
          { id: 'timeline', label: '时间范围', scopeTag: 'dimension' },
        ],
      });
    }

    return Promise.resolve({
      id: randomUUID(),
      sequence: history.length,
      question: '再补充一个细节, 让意图更清晰',
      context: '选择最关键的下一步',
      options: [
        { id: 'audience', label: '影响对象', scopeTag: 'detail' },
        { id: 'constraint', label: '主要约束', scopeTag: 'detail' },
      ],
    });
  }
}

export interface ClarificationControllerDeps {
  sessionRepository: SessionRepository;
  okrRepository: OkrRepository;
  actionLogWriter: ActionLogWriter;
  stickyWindowManager: StickyWindowManager;
  llmService: LlmIntegrationService;
  okrBuilder: OkrBuilderService;
  elect?: typeof electron;
}

export class ClarificationController {
  private readonly agent: ClarificationAgent = new StaticPromptAgent();

  constructor(private readonly deps: ClarificationControllerDeps) {
    this.registerHandlers();
  }

  private get llm(): LlmIntegrationService {
    return this.deps.llmService;
  }

  private get okrBuilder(): OkrBuilderService {
    return this.deps.okrBuilder;
  }

  private get sessionRepository(): SessionRepository {
    return this.deps.sessionRepository;
  }

  private get okrRepository(): OkrRepository {
    return this.deps.okrRepository;
  }

  private get actionLogWriter(): ActionLogWriter {
    return this.deps.actionLogWriter;
  }

  private get stickyWindowManager(): StickyWindowManager {
    return this.deps.stickyWindowManager;
  }

  private get elect(): typeof electron {
    return this.deps.elect ?? electron;
  }

  private registerHandlers(): void {
    this.elect.ipcMain.handle(IPCChannels.CLARIFICATION_PROMPT, async (_event, payload) => {
      const request = clarificationPromptRequestSchema.parse(payload);
      const persisted = await this.sessionRepository.load();
      console.info('[main] prompt request received', {
        sessionId: request.sessionId,
        intent: request.intent,
        hasPersistedSession: Boolean(persisted.session),
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
        pendingQuestionId: null,
      };

      const data = await this.llm.getNextQuestion(
        { turns: [] },
        { questionId: 'init', optionId: request.intent },
      );
      const nextPrompt = this.okrBuilder.mapLlmQuestionToPrompt(data.question, 0);

      session.steps = [...session.steps, nextPrompt];
      session.pendingQuestionId = nextPrompt.id;
      session.updatedAt = new Date().toISOString();

      await this.sessionRepository.saveSession(session);
      void this.logAction({
        actionType: 'generate',
        sessionId: session.id,
        okrId: null,
        payloadSummary: `prompt:${nextPrompt.id}`,
      }).catch((error) => {
        this.logUnexpectedError('Failed to record generate action', error);
      });

      console.info('[main] prompt resolved', {
        promptId: nextPrompt.id,
        sequence: nextPrompt.sequence,
      });
      return clarificationPromptResponseSchema.parse({ prompt: nextPrompt });
    });

    this.elect.ipcMain.on(IPCChannels.CLARIFICATION_RESPOND, (event, payload) => {
      void this.handleResponse(event, payload, { generateNext: false });
    });

    this.elect.ipcMain.handle(IPCChannels.OKR_GENERATE, async (_event, payload) => {
      const request = generateOKRRequestSchema.parse(payload);
      const persisted = await this.sessionRepository.load();
      const sessionCandidate = persisted.session;
      if (!sessionCandidate || sessionCandidate.id !== request.sessionId) {
        throw new Error('No active session found for OKR generation.');
      }

      const session = clarificationSessionSchema.parse(sessionCandidate);
      const okr = this.okrBuilder.buildFallbackOkr(session, request.intentSummary);

      console.info('[main] generating OKR document', {
        sessionId: session.id,
        okrId: okr.id,
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
        payloadSummary: `okr:${okr.id}`,
      });

      await this.stickyWindowManager.open(okr);

      return generateOKRResponseSchema.parse({ okr, session });
    });

    this.elect.ipcMain.handle(IPCChannels.STICKY_REOPEN, async () => {
      const okr = await this.okrRepository.loadLatest();
      if (!okr) {
        return { success: false };
      }

      await this.stickyWindowManager.open(okr);
      return { success: true };
    });

    this.elect.ipcMain.handle(IPCChannels.OKR_LATEST, async () => {
      const okr = await this.okrRepository.loadLatest();
      return okr ?? null;
    });

    this.elect.ipcMain.handle(
      IPCChannels.LLM_NEXT_QUESTION,
      async (_event, payload): Promise<LlmNextQuestionResponse> => {
        const body = payload as LlmNextQuestionRequest;
        const data = await this.llm.getNextQuestion(body.context, body.lastChoice);

        const persisted = await this.sessionRepository.load();
        const sessionCandidate = persisted.session;
        if (!sessionCandidate) {
          return data;
        }
        const session = clarificationSessionSchema.parse(sessionCandidate);
        const prompt = this.okrBuilder.mapLlmQuestionToPrompt(data.question, session.steps.length);
        session.steps.push(prompt);
        session.pendingQuestionId = prompt.id;
        session.updatedAt = new Date().toISOString();
        await this.sessionRepository.saveSession(session);
        this.elect.webContents
          .getAllWebContents()
          .forEach((wc) => wc.send(IPCChannels.CLARIFICATION_PROMPT, { prompt }));
        return data;
      },
    );

    this.elect.ipcMain.handle(
      IPCChannels.LLM_GENERATE_DRAFT,
      async (_event, payload): Promise<OkrDraftResponse> => {
        const body = payload as OkrDraftRequest;
        const persisted = await this.sessionRepository.load();
        const session = persisted.session
          ? clarificationSessionSchema.parse(persisted.session)
          : null;

        if (!session) {
          throw new Error('No active session found for LLM draft generation.');
        }

        const context = body.context ?? {
          turns: session.steps.map((p) => ({
            questionId: p.id,
            optionId: 'unknown',
            timestamp: new Date().toISOString(),
          })),
        };
        const llmDraft = await this.llm.generateDraft(context);
        const okr = this.okrBuilder.buildOkrFromLlmDraft(session, llmDraft);

        await this.okrRepository.save(okr);

        const response = generateOKRResponseSchema.parse({ okr, session });
        this.elect.webContents
          .getAllWebContents()
          .forEach((wc) => wc.send(IPCChannels.OKR_GENERATE, response));
        return response;
      },
    );
  }

  private async logAction(entry: Omit<UserActionLogEntry, 'id' | 'occurredAt'>): Promise<void> {
    const action: UserActionLogEntry = {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      ...entry,
    };

    await this.actionLogWriter.append(action);
  }

  private async handleResponse(
    event: IpcMainEvent,
    payload: unknown,
    opts: { generateNext: boolean } = { generateNext: true },
  ): Promise<void> {
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
      payloadSummary: `selected:${response.optionId}`,
    }).catch((error) => {
      this.logUnexpectedError('Failed to record selection action', error);
    });

    if (opts.generateNext) {
      const nextPrompt = await this.agent.nextPrompt(session.initialIntent, session.steps);
      session.steps.push(nextPrompt);
      session.pendingQuestionId = nextPrompt.id;
      await this.sessionRepository.saveSession(session);

      const targetContents = this.elect.webContents.fromId(event.sender.id);
      targetContents?.send(IPCChannels.CLARIFICATION_PROMPT, {
        prompt: nextPrompt,
      });
      console.info('[main] emitted follow-up prompt', {
        sessionId: session.id,
        promptId: nextPrompt.id,
        sequence: nextPrompt.sequence,
      });
      void this.logAction({
        actionType: 'generate',
        sessionId: session.id,
        okrId: null,
        payloadSummary: `prompt:${nextPrompt.id}`,
      }).catch((error) => {
        this.logUnexpectedError('Failed to record follow-up prompt', error);
      });
    }
  }

  private logUnexpectedError(message: string, error: unknown): void {
    if (error instanceof Error) {
      console.error(message, error);
      return;
    }

    let serialized: string;

    if (typeof error === 'string') {
      serialized = error;
    } else if (typeof error === 'object' && error !== null) {
      try {
        serialized = JSON.stringify(error, undefined, 2);
      } catch {
        serialized = '[object Object]';
      }
    } else {
      serialized = String(error);
    }

    console.error(message, new Error(serialized));
  }
}
