import { jest } from '@jest/globals';
import { IPC_CHANNELS, clarificationPromptResponseSchema } from '@clarityokr/contracts';
import { ClarificationIpcRouter } from '@clarityokr/main/windows/clarification-ipc-router';
import type { ClarificationIpcRouterDeps } from '@clarityokr/main/windows/clarification-ipc-router';

it('returns next questions in the renderer shared response envelope', async () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>();
  const prompt = {
    id: 'q2',
    sequence: 1,
    question: 'Which outcome matters?',
    context: 'Team goal',
    options: [
      { id: 'a', label: 'Quality', scopeTag: 'llm' },
      { id: 'b', label: 'Speed', scopeTag: 'llm' },
    ],
  };
  const context = {
    turns: [{ questionId: 'q1', optionId: 'a', timestamp: new Date().toISOString() }],
  };
  const getNextQuestion = jest
    .fn<(...args: unknown[]) => Promise<typeof prompt>>()
    .mockResolvedValue(prompt);
  const deps = {
    ipcMain: {
      handle: (channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) =>
        handlers.set(channel, handler),
      on: jest.fn(),
    },
    getAllWebContents: () => [],
    sessionManager: { getCurrentSessionId: () => 'session-1' },
    promptHandler: { getNextQuestion },
    responseHandler: {},
    draftHandler: {},
    okrRepository: {},
    stickyWindowManager: {},
    okrRegenerationService: {},
    actionLogService: {},
  } as unknown as ClarificationIpcRouterDeps;
  ClarificationIpcRouter.registerHandlers(deps);
  const handler = handlers.get(IPC_CHANNELS.LLM_NEXT_QUESTION);
  expect(handler).toBeDefined();
  const response = await handler?.(
    {},
    { context, lastChoice: { questionId: 'q1', optionId: 'a' } },
  );
  expect(clarificationPromptResponseSchema.parse(response).prompt).toEqual(prompt);
  expect(getNextQuestion).toHaveBeenCalledWith('session-1', 'q1', context);
});

function editRouter() {
  const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>();
  const document = {
    id: 'okr-1',
    objective: 'Original',
    sourceSessionId: 'session-1',
    generatedAt: '2026-10-09T00:00:00.000Z',
    regenerationPolicy: 'append',
    manualEdits: [],
    keyResults: [{ id: 'kr-1', statement: 'Existing result' }],
  };
  const save = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const send = jest.fn();
  const deps = {
    ipcMain: {
      handle: (channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) =>
        handlers.set(channel, handler),
      on: jest.fn(),
    },
    getAllWebContents: () => [{ send }],
    okrRepository: {
      findById: jest.fn<() => Promise<unknown>>().mockResolvedValue(document),
      save,
    },
    actionLogService: { logAction: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) },
    sessionManager: {},
    promptHandler: {},
    responseHandler: {},
    draftHandler: {},
    stickyWindowManager: {},
    okrRegenerationService: {},
  } as unknown as ClarificationIpcRouterDeps;
  ClarificationIpcRouter.registerHandlers(deps);
  return { handlers, document, save, send };
}

it('persists only validated editable fields and broadcasts server-owned metadata', async () => {
  const { handlers, document, save, send } = editRouter();
  const result = await handlers.get(IPC_CHANNELS.OKR_UPDATE)?.(
    {},
    {
      id: document.id,
      objective: 'Edited',
      keyResults: document.keyResults,
      sourceSessionId: 'forged',
      generatedAt: 'forged',
      manualEdits: [{ forged: true }],
    },
  );
  expect(result).toEqual({ ...document, objective: 'Edited' });
  expect(save).toHaveBeenCalledWith(result);
  expect(send).toHaveBeenCalledWith(IPC_CHANNELS.OKR_GENERATE, { okr: result });
});

it('rejects invalid edits before persistence or broadcasts', async () => {
  const { handlers, document, save, send } = editRouter();
  await expect(
    handlers.get(IPC_CHANNELS.OKR_UPDATE)?.({}, { id: document.id, objective: '', keyResults: [] }),
  ).rejects.toThrow();
  expect(save).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
