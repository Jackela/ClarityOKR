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
  KeyResult,
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
import { OkrAgentService } from '../services/okr-agent.service.js';
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

export class ClarificationController {
  private readonly agent: ClarificationAgent = new StaticPromptAgent();

  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly okrRepository: OkrRepository,
    private readonly actionLogWriter: ActionLogWriter,
    private readonly stickyWindowManager: StickyWindowManager,
    private readonly elect: typeof electron = electron,
  ) {
    this.registerHandlers();
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

      // Use LLM to generate the initial prompt as well
      const llm = new OkrAgentService();
      let data: unknown;
      try {
        data = await llm.getNextQuestion(
          { turns: [] },
          { questionId: 'init', optionId: request.intent },
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[main] LLM getNextQuestion failed:', errorMsg);
        throw new Error(`Failed to generate clarification prompt: ${errorMsg}`);
      }

      if (!data || typeof data !== 'object') {
        throw new Error('Empty or invalid response from LLM service');
      }

      type NextQ = {
        question: {
          id: string;
          text: string;
          options: Array<{ id: string; label: string; value?: string }>;
        };
      };
      const typedData = data as NextQ;

      if (!typedData.question || !typedData.question.id || !typedData.question.text) {
        throw new Error('LLM response missing required question fields');
      }

      const q = typedData.question;
      const nextPrompt: ClarificationPrompt = {
        id: q.id,
        sequence: 0,
        question: q.text,
        context: 'LLM generated',
        options: (q.options ?? []).map((o) => ({
          id: o.id,
          label: o.label,
          description: undefined,
          scopeTag: 'llm',
        })),
      };

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
      // Persist selection only; next prompt will be produced by LLM path
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
      const okr = this.buildOkrDocument(session, request.intentSummary);

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

    // LLM-backed handlers for real-time clarification and OKR generation
    const agent = new OkrAgentService();
    this.elect.ipcMain.handle(
      IPCChannels.LLM_NEXT_QUESTION,
      async (_event, payload): Promise<LlmNextQuestionResponse> => {
        const body = payload as LlmNextQuestionRequest;

        let data: LlmNextQuestionResponse;
        try {
          data = (await agent.getNextQuestion(
            body.context,
            body.lastChoice,
          )) as LlmNextQuestionResponse;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error('[main] LLM getNextQuestion failed:', errorMsg);
          throw new Error(`Failed to get next question: ${errorMsg}`);
        }

        if (!data || typeof data !== 'object' || !data.question) {
          throw new Error('Empty or invalid response from LLM next question service');
        }

        // Map LLM question into ClarificationPrompt and broadcast
        const persisted = await this.sessionRepository.load();
        const sessionCandidate = persisted.session;
        if (!sessionCandidate) {
          return data;
        }
        const session = clarificationSessionSchema.parse(sessionCandidate);
        const sequence = session.steps.length;
        const q = data.question;
        const prompt: ClarificationPrompt = {
          id: q.id,
          sequence,
          question: q.text,
          context: 'LLM generated',
          options: (q.options ?? []).map((o) => ({
            id: o.id,
            label: o.label,
            description: undefined,
            scopeTag: 'llm',
          })),
        };
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

        let llmDraft: unknown;
        try {
          llmDraft = await agent.generateDraft(context);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error('[main] LLM generateDraft failed:', errorMsg);
          throw new Error(`Failed to generate OKR draft: ${errorMsg}`);
        }

        if (!llmDraft || typeof llmDraft !== 'object') {
          throw new Error('Empty or invalid response from LLM draft service');
        }

        type DraftKR = { id?: string; statement?: string; target?: unknown; measurement?: string };
        type DraftObj = {
          id?: string;
          title?: string;
          description?: string;
          keyResults?: DraftKR[];
        };
        type DraftPayload = { draft?: { objectives?: DraftObj[] } };
        const draft = (llmDraft as DraftPayload).draft;

        if (
          !draft ||
          !draft.objectives ||
          !Array.isArray(draft.objectives) ||
          draft.objectives.length === 0
        ) {
          throw new Error('LLM draft response missing required objectives field');
        }

        const first = draft.objectives[0];
        if (!first || (!first.title && !first.description)) {
          throw new Error('LLM draft objective missing required title or description');
        }

        const okr: OKRDocument = {
          id: randomUUID(),
          objective: first.title ?? first.description ?? '自动生成的目标',
          keyResults: (first.keyResults ?? []).slice(0, 5).map((kr) => ({
            id: String(kr?.id ?? randomUUID()),
            statement: String(kr?.statement ?? ''),
            successMetric:
              typeof kr?.target !== 'undefined' && typeof kr?.measurement === 'string'
                ? `${String(kr.target)} ${kr.measurement}`
                : undefined,
            owner: undefined,
          })),
          sourceSessionId: session.id,
          generatedAt: new Date().toISOString(),
          lastEditedAt: null,
          regenerationPolicy: 'append',
          manualEdits: [],
        };

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
      manualEdits: [],
    } satisfies OKRDocument;
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

  private createKeyResults(intentSummary: string): KeyResult[] {
    return [
      {
        id: randomUUID(),
        statement: `为“${intentSummary}”设定可衡量的流程节奏`,
        successMetric: '每周复盘 1 次',
        owner: '团队负责人',
      },
      {
        id: randomUUID(),
        statement: `建立 ${intentSummary} 成果指标追踪`,
        successMetric: '关键指标提升 15%',
        owner: undefined,
      },
    ];
  }
}
