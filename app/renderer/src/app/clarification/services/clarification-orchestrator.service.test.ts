import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ClarificationOrchestratorService } from './clarification-orchestrator.service';
import { ClarificationStateMachine } from './clarification-state-machine.service';
import { Logger } from '../../core/services/logger.service';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import type { ClarifyOkrApi } from '../../shared/window';

describe('real renderer IPC clarification flow', () => {
  const prompt = {
    id: 'q1',
    sequence: 0,
    question: '选择目标',
    context: '提高效率',
    options: [
      { id: 'a', label: '效率', scopeTag: 'llm' },
      { id: 'b', label: '质量', scopeTag: 'llm' },
    ],
  };
  let service: ClarificationOrchestratorService;
  let state: ClarificationStateMachine;
  let listener: (event: unknown, payload: unknown) => void;
  const unsubscribe = jest.fn();
  const invoke = jest.fn();
  const send = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    const bridge: ClarifyOkrApi = {
      invoke,
      send,
      on: (_channel, callback) => {
        listener = callback;
        return unsubscribe;
      },
    };
    window.clarifyOkr = bridge;
    invoke.mockResolvedValue({ prompt });
    TestBed.configureTestingModule({
      providers: [
        ClarificationOrchestratorService,
        ClarificationStateMachine,
        { provide: Logger, useValue: { debug: jest.fn(), info: jest.fn(), error: jest.fn() } },
      ],
    });
    state = TestBed.inject(ClarificationStateMachine);
    service = TestBed.inject(ClarificationOrchestratorService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    delete window.clarifyOkr;
  });

  it('loads and validates the first prompt through the canonical IPC response envelope', async () => {
    await firstValueFrom(service.requestPrompt('session-1', '提高效率'));
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.CLARIFICATION_PROMPT, {
      sessionId: 'session-1',
      intent: '提高效率',
    });
    expect(state.currentPrompt()?.id).toBe('q1');
    expect(state.workflowState()).toBe('prompting');
  });

  it('rejects an invalid initial intent before sending an IPC request', async () => {
    await expect(firstValueFrom(service.requestPrompt('session-1', '短'))).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps selections in the next-question request and updates the real state machine', async () => {
    await firstValueFrom(service.requestPrompt('session-1', '提高效率'));
    await firstValueFrom(service.recordSelection('session-1', 'q1', 'a'));
    invoke.mockResolvedValue({ prompt: { ...prompt, id: 'q2', sequence: 1 } });
    await firstValueFrom(service.requestNextQuestion('q1', 'a'));
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.CLARIFICATION_RESPOND, {
      sessionId: 'session-1',
      promptId: 'q1',
      optionId: 'a',
    });
    expect(invoke.mock.calls.at(-1)?.[1]).toMatchObject({
      lastChoice: { questionId: 'q1', optionId: 'a' },
      context: { turns: [{ questionId: 'q1', optionId: 'a' }] },
    });
    expect(state.currentPrompt()?.id).toBe('q2');
  });

  it('exposes an IPC failure as recoverable without losing the selected option', async () => {
    await firstValueFrom(service.requestPrompt('session-1', '提高效率'));
    await firstValueFrom(service.recordSelection('session-1', 'q1', 'a'));
    invoke.mockRejectedValue(new Error('offline'));
    await expect(firstValueFrom(service.requestNextQuestion('q1', 'a'))).rejects.toThrow('offline');
    expect(state.getStateSnapshot().selections).toEqual({ q1: 'a' });
    expect(state.hasError()).toBe(true);
    service.clearError();
    expect(state.hasError()).toBe(false);
  });

  it('rejects a bare prompt rather than silently accepting a broken main response', async () => {
    invoke.mockResolvedValue(prompt);
    await expect(firstValueFrom(service.requestPrompt('session-1', '提高效率'))).rejects.toThrow();
    expect(state.hasError()).toBe(true);
  });

  it('validates pushed prompt events and removes its registered listener on destruction', async () => {
    await firstValueFrom(service.requestPrompt('session-1', '提高效率'));
    listener(undefined, { prompt: { ...prompt, id: 'pushed' } });
    expect(state.currentPrompt()?.id).toBe('pushed');
    listener(undefined, { invalid: true });
    expect(state.hasError()).toBe(true);
    service.ngOnDestroy();
    service.ngOnDestroy();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('fails explicitly when the sandbox bridge is unavailable', () => {
    delete window.clarifyOkr;
    expect(() => service.requestPrompt('session-1', '提高效率')).toThrow();
  });
});
