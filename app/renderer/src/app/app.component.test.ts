import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AppComponent } from './app.component';
import { ClarificationStateMachine } from './clarification/services/clarification-state-machine.service';
import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
import { OkrStickyService } from './okr-sticky/services/okr-sticky.service';
import { Logger } from './core/services/logger.service';

describe('root clarification recovery', () => {
  const state = {
    reset: jest.fn(),
    start: jest.fn(),
    clearError: jest.fn(),
    setLoading: jest.fn(),
    setError: jest.fn(),
    getStateSnapshot: jest.fn(() => ({ selections: {} as Record<string, string> })),
  };
  const orchestrator = { requestPrompt: jest.fn(), requestNextQuestion: jest.fn() };
  let component: AppComponent;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => '12345678-1234-4234-8234-123456789012',
    });
    state.getStateSnapshot.mockReturnValue({ selections: {} });
    orchestrator.requestPrompt.mockReturnValue(of(undefined));
    orchestrator.requestNextQuestion.mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: ClarificationStateMachine, useValue: state },
        { provide: ClarificationOrchestratorService, useValue: orchestrator },
        { provide: OkrStickyService, useValue: {} },
        { provide: Logger, useValue: {} },
      ],
    }).overrideComponent(AppComponent, { set: { template: '', imports: [] } });
    component = TestBed.createComponent(AppComponent).componentInstance;
    component.intentControl.setValue('提高团队效率');
  });

  it('rejects an intent shorter than the shared three-character boundary', () => {
    component.intentControl.setValue('目标');
    component.beginClarification();
    expect(orchestrator.requestPrompt).not.toHaveBeenCalled();
    expect(component.intentControl.touched).toBe(true);
  });

  it('retries the initial request with the same session and intent', () => {
    component.beginClarification();
    const original = orchestrator.requestPrompt.mock.calls[0];
    component.onRetry();
    expect(orchestrator.requestPrompt.mock.calls[1]).toEqual(original);
    expect(orchestrator.requestNextQuestion).not.toHaveBeenCalled();
  });

  it('retries the latest selected question without losing the session or choices', () => {
    state.getStateSnapshot.mockReturnValue({ selections: { q1: 'a', q2: 'b' } });
    component.onRetry();
    expect(orchestrator.requestNextQuestion).toHaveBeenCalledWith('q2', 'b');
    expect(orchestrator.requestPrompt).not.toHaveBeenCalled();
    expect(state.reset).not.toHaveBeenCalled();
  });

  it('keeps a failed retry recoverable and displays its error', () => {
    state.getStateSnapshot.mockReturnValue({ selections: { q1: 'a' } });
    orchestrator.requestNextQuestion.mockReturnValue(throwError(() => new Error('offline')));
    component.onRetry();
    expect(state.setError).toHaveBeenCalledWith({ message: 'offline', recoverable: true });
  });
});
