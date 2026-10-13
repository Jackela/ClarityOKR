import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IPC_CHANNELS } from '@clarityokr/contracts';

import { AppComponent } from './app.component';
import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
import { ClarificationStateMachine } from './clarification/services/clarification-state-machine.service';
import { ClosedLoopApi } from './closed-loop/closed-loop-api.service';
import { Logger } from './core/services/logger.service';
import { OkrStickyService } from './okr-sticky/services/okr-sticky.service';

/** §4.5a 新建 OKR (main window) and the wizard's unsaved flag (§1.2c). */
describe('AppComponent: 新建 OKR and the unsaved wizard flag', () => {
  const workflow = signal<string>('idle');
  const history = signal<unknown[]>([]);
  const state = {
    reset: jest.fn(),
    workflowState: workflow,
    history,
    hasPrompt: () => false,
    hasError: () => false,
  };
  let api: { onEvent: jest.Mock; reportUnsaved: jest.Mock };
  let newOkr: () => void;
  let component: AppComponent;

  beforeEach(() => {
    jest.useFakeTimers();
    workflow.set('idle');
    history.set([]);
    state.reset.mockClear();
    api = {
      onEvent: jest.fn((channel: string, listener: () => void) => {
        if (channel === IPC_CHANNELS.WIZARD_NEW_OKR) newOkr = listener;
        return jest.fn();
      }),
      reportUnsaved: jest.fn().mockResolvedValue({ ok: true, data: { recorded: true } }),
    };
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: ClarificationStateMachine, useValue: state },
        { provide: ClarificationOrchestratorService, useValue: {} },
        { provide: OkrStickyService, useValue: { getCurrentViewModel: () => null } },
        { provide: Logger, useValue: {} },
        { provide: ClosedLoopApi, useValue: api },
      ],
    }).overrideComponent(AppComponent, { set: { template: '', imports: [] } });
    component = TestBed.createComponent(AppComponent).componentInstance;
  });

  afterEach(() => jest.useRealTimers());

  it('listens for wizard:new-okr', () => {
    expect(api.onEvent).toHaveBeenCalledWith(IPC_CHANNELS.WIZARD_NEW_OKR, expect.any(Function));
  });

  it('an empty wizard is reset right away, no dialog', () => {
    newOkr();
    expect(component.newOkrConfirm()).toBe(false);
    expect(state.reset).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a typed goal', () => component.intentControl.setValue('提高效率')],
    ['a running clarification', () => workflow.set('prompting')],
    ['an error to retry', () => workflow.set('error')],
  ])('%s asks first and does not reset', (_name, arrange) => {
    arrange();
    newOkr();
    expect(component.newOkrConfirm()).toBe(true);
    expect(state.reset).not.toHaveBeenCalled();
    newOkr(); // a second request while the dialog is open changes nothing
    expect(component.newOkrConfirm()).toBe(true);
  });

  it('a completed wizard is not dirty', () => {
    component.intentControl.setValue('提高效率');
    workflow.set('completed');
    expect(component.wizardDirty()).toBe(false);
  });

  it('after the OKR was generated (state stays ready) the wizard is not dirty', async () => {
    const gateway = TestBed.inject(OkrStickyService) as unknown as { generate: jest.Mock };
    gateway.generate = jest.fn().mockResolvedValue({});
    workflow.set('ready');
    expect(component.wizardDirty()).toBe(true);
    await component.onGenerate();
    expect(component.wizardDirty()).toBe(false);
    workflow.set('idle'); // 返回 (go back) with the goal still typed
    component.intentControl.setValue('新的目标');
    expect(component.wizardDirty()).toBe(true);
  });

  it('「继续当前向导」 keeps everything', () => {
    component.intentControl.setValue('提高效率');
    newOkr();
    component.keepWizard();
    jest.runAllTimers();
    expect(component.newOkrConfirm()).toBe(false);
    expect(state.reset).not.toHaveBeenCalled();
    expect(component.intentControl.value).toBe('提高效率');
  });

  it('「重新开始」 resets the wizard and empties the goal; the first field gets the focus', () => {
    const input = document.createElement('input');
    input.id = 'intent-input';
    document.body.appendChild(input);
    try {
      component.intentControl.setValue('提高效率');
      newOkr();
      component.restartWizard();
      jest.runAllTimers();
      expect(state.reset).toHaveBeenCalledTimes(1);
      expect(component.intentControl.value).toBe('');
      expect(document.activeElement).toBe(input);
    } finally {
      input.remove();
    }
  });

  it('reports only the changed flag to the main process', () => {
    TestBed.tick();
    expect(api.reportUnsaved).not.toHaveBeenCalled();
    component.intentControl.setValue('提高效率');
    TestBed.tick();
    expect(api.reportUnsaved).toHaveBeenLastCalledWith({ wizard: true });
    component.intentControl.setValue('');
    TestBed.tick();
    expect(api.reportUnsaved).toHaveBeenLastCalledWith({ wizard: false });
    expect(api.reportUnsaved).toHaveBeenCalledTimes(2);
  });
});
