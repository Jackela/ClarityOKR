import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ClarificationPrompt, OKRDocument } from '@clarityokr/contracts';
import { AppComponent } from './app.component';
import { ClarificationStateMachine } from './clarification/services/clarification-state-machine.service';
import { OkrStickyService } from './okr-sticky/services/okr-sticky.service';
import { Logger } from './core/services/logger.service';
import { IPC_CHANNELS } from './shared/ipc-channel.tokens';

const prompt: ClarificationPrompt = {
  id: 'actual-root-prompt',
  question: 'Which priority?',
  sequence: 0,
  context: 'goal-dimension',
  options: [
    { id: 'speed', label: 'Speed', scopeTag: 'speed' },
    { id: 'quality', label: 'Quality', scopeTag: 'quality' },
  ],
};
const okr: OKRDocument = {
  id: 'actual-root-okr',
  objective: 'Improve deliveries',
  keyResults: [{ id: 'kr', statement: 'Deliver more', successMetric: '10 per month' }],
  sourceSessionId: '12345678-1234-4234-8234-123456789012',
  generatedAt: '2026-01-01T00:00:00.000Z',
  lastEditedAt: null,
  regenerationPolicy: 'append',
  manualEdits: [],
};

describe('Actual root UI wiring with real state, orchestrator and sticky services', () => {
  const originalBridge = window.clarifyOkr;
  const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const originalUUID = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
  const invoke = jest.fn<Promise<unknown>, [string, unknown?]>();
  const send = jest.fn();
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let state: ClarificationStateMachine;
  let sticky: OkrStickyService;
  beforeEach(async () => {
    invoke.mockReset();
    send.mockReset();
    invoke.mockImplementation(async (channel) => {
      if (channel === IPC_CHANNELS.OKR_LATEST) return null;
      if (channel === IPC_CHANNELS.LLM_GENERATE_DRAFT)
        return {
          okr,
          session: {
            id: okr.sourceSessionId,
            initialIntent: 'Improve deliveries',
            status: 'completed',
            createdAt: okr.generatedAt,
            updatedAt: okr.generatedAt,
            steps: [],
            selectedOptions: [],
            confidence: 1,
          },
        };
      if (channel === IPC_CHANNELS.STICKY_REOPEN) return { success: true };
      return { prompt };
    });
    window.clarifyOkr = { invoke, send, on: () => () => {} };
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: () => true,
      }),
    });
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => '12345678-1234-4234-8234-123456789012',
    });
    await TestBed.configureTestingModule({ imports: [AppComponent] }).compileComponents();
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(ClarificationStateMachine);
    sticky = TestBed.inject(OkrStickyService);
    fixture.detectChanges();
    await fixture.whenStable();
  });
  afterEach(() => {
    fixture?.destroy();
    window.clarifyOkr = originalBridge;
    jest.restoreAllMocks();
    if (originalUUID) Object.defineProperty(globalThis.crypto, 'randomUUID', originalUUID);
    else Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    else Reflect.deleteProperty(window, 'matchMedia');
  });
  async function begin(): Promise<void> {
    component.intentControl.setValue('Improve deliveries');
    component.beginClarification(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('uses real form validation, routes the selected prompt ID, then renders an acknowledged OKR', async () => {
    component.intentControl.setValue('x');
    component.beginClarification();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#intent-error')).not.toBeNull();
    expect(invoke.mock.calls.filter(([c]) => c === IPC_CHANNELS.CLARIFICATION_PROMPT)).toHaveLength(
      0,
    );
    await begin();
    expect(state.currentPrompt()?.id).toBe(prompt.id);
    expect(component.showClarificationWizard()).toBe(true);
    expect(document.activeElement?.tagName).toBe('BODY');
    const option: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="clarification-option"]',
    );
    option.click();
    await fixture.whenStable();
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.CLARIFICATION_RESPOND, {
      sessionId: okr.sourceSessionId,
      promptId: prompt.id,
      optionId: 'speed',
    });
    await component.onGenerate();
    fixture.detectChanges();
    expect(component.hasStickyNote()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[data-testid="okr-summary"]').textContent,
    ).toContain(okr.objective);
    const before = sticky.getCurrentViewModel()?.keyResults.length;
    component.onAddKeyResult();
    expect(sticky.getCurrentViewModel()?.keyResults.length).toBe((before ?? 0) + 1);
    await component.reopenSticky();
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.STICKY_REOPEN, undefined);
  });

  it('does not request another question when recording the selection fails synchronously', async () => {
    await begin();
    send.mockImplementation(() => {
      throw new Error('selection IPC unavailable');
    });
    expect(() => component.onOptionSelected('speed')).not.toThrow();
    expect(state.errorMessage()).toBe('selection IPC unavailable');
    expect(state.isLoading()).toBe(false);
    expect(invoke.mock.calls.filter(([c]) => c === IPC_CHANNELS.LLM_NEXT_QUESTION)).toHaveLength(0);
    send.mockReset();
    component.onOptionSelected('speed');
    await fixture.whenStable();
    expect(invoke.mock.calls.filter(([c]) => c === IPC_CHANNELS.LLM_NEXT_QUESTION)).toHaveLength(1);
  });

  it('ignores duplicate selection while pending and releases the busy guard after rejection', async () => {
    component.onOptionSelected('speed');
    expect(send).not.toHaveBeenCalled();
    await begin();
    let rejectNext: ((error: unknown) => void) | undefined;
    invoke.mockImplementation(async (channel) =>
      channel === IPC_CHANNELS.LLM_NEXT_QUESTION
        ? new Promise((_, reject) => {
            rejectNext = reject;
          })
        : { prompt },
    );
    component.onOptionSelected('speed');
    component.onOptionSelected('quality');
    expect(send).toHaveBeenCalledTimes(1);
    rejectNext?.('synthetic network rejection');
    await fixture.whenStable();
    expect(state.errorMessage()).toBe('synthetic network rejection');
    expect(state.isLoading()).toBe(false);
    invoke.mockResolvedValue({ prompt });
    component.onOptionSelected('quality');
    await fixture.whenStable();
    expect(send).toHaveBeenCalledTimes(2);
    expect(state.getSelection(prompt.id)).toBe('quality');
  });

  it('cancels root-owned prompt subscriptions when the view is destroyed', async () => {
    let complete: ((response: unknown) => void) | undefined;
    invoke.mockImplementation(async (channel) =>
      channel === IPC_CHANNELS.CLARIFICATION_PROMPT
        ? new Promise((resolve) => {
            complete = resolve;
          })
        : null,
    );
    component.intentControl.setValue('Improve deliveries');
    component.beginClarification();
    expect(state.workflowState()).toBe('loading');
    fixture.destroy();
    complete?.({ prompt });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.currentPrompt()).toBeNull();
    expect(state.workflowState()).toBe('loading');
  });

  it('retains a recoverable error when the bridge disappears before retry', async () => {
    await begin();
    state.setError({ message: 'synthetic network failure', recoverable: true });
    Reflect.deleteProperty(window, 'clarifyOkr');
    expect(() => component.onRetry()).not.toThrow();
    expect(state.hasError()).toBe(true);
    expect(state.isLoading()).toBe(false);
  });

  it('keeps a generation failure visible to logging without inventing successful content', async () => {
    await begin();
    const logged = jest.spyOn(TestBed.inject(Logger), 'error');
    invoke.mockRejectedValue('synthetic generation rejection');
    await component.onGenerate();
    expect(component.hasStickyNote()).toBe(false);
    expect(logged).toHaveBeenCalledWith(
      '[renderer] generate failed',
      'synthetic generation rejection',
    );
  });
});
