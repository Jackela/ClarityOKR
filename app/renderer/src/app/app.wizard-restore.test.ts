import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { WIZARD_DRAFT_FORMAT, type DraftRow, type WizardDraftStep } from '@clarityokr/contracts';

import { AppComponent } from './app.component';
import { ClarificationWizardComponent } from './clarification/components/clarification-wizard.component';
import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
import { ClarificationStateMachine } from './clarification/services/clarification-state-machine.service';
import { ClosedLoopApi } from './closed-loop/closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop/closed-loop.store';
import { DraftRestoreHosts } from './closed-loop/draft-restore';
import { Logger } from './core/services/logger.service';
import { EditModeStore } from './okr-sticky/state/edit-mode.store';
import { OkrStickyService } from './okr-sticky/services/okr-sticky.service';

const step = (n: number, selected: boolean): WizardDraftStep => ({
  prompt: {
    id: `q${n}`,
    sequence: n - 1,
    question: `第 ${n} 个问题`,
    context: '提升团队交付效率',
    options: [1, 2, 3].map((k) => ({
      id: `q${n}-o${k}`,
      label: `选项 ${k}`,
      description: `说明 ${k}`,
      scopeTag: 'llm',
    })),
  },
  selectedOptionId: selected ? `q${n}-o2` : null,
});

const row = (steps: unknown[], extra: Partial<Extract<DraftRow, { kind: 'wizard' }>> = {}) =>
  ({
    kind: 'wizard',
    step: steps.length,
    intent: '提升团队交付效率',
    format: WIZARD_DRAFT_FORMAT,
    sessionId: 'wiz-1',
    steps,
    ...extra,
  }) as DraftRow;

/**
 * #116 (S3§12.9) in the main window: 恢复 puts the wizard back at the step left, from the saved
 * questions only. The orchestrator (the only way to the model) is a set of spies.
 */
describe('AppComponent: wizard draft restored to step n (#116)', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let state: ClarificationStateMachine;
  let hosts: DraftRestoreHosts;
  const orchestrator = {
    requestPrompt: jest.fn(),
    recordSelection: jest.fn(),
    requestNextQuestion: jest.fn(),
  };
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  beforeEach(() => {
    jest.useFakeTimers();
    Object.values(orchestrator).forEach((f) => f.mockReset());
    Object.values(logger).forEach((f) => f.mockReset());
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        ClarificationStateMachine,
        { provide: ClarificationOrchestratorService, useValue: orchestrator },
        { provide: OkrStickyService, useValue: { getCurrentViewModel: () => null } },
        { provide: ClosedLoopStore, useValue: { openFromHistory: jest.fn() } },
        {
          provide: EditModeStore,
          useValue: {
            isEditing: () => false,
            isDirty: () => false,
            checkpoint: () => 0,
            originalKeyResults: () => [],
            draftKeyResults: () => [],
            originalObjective: () => '',
            draftObjective: () => '',
          },
        },
        { provide: Logger, useValue: logger },
        {
          provide: ClosedLoopApi,
          useValue: {
            onEvent: () => jest.fn(),
            reportUnsaved: jest.fn().mockResolvedValue({ ok: true }),
            reportDraft: jest.fn().mockResolvedValue({ ok: true }),
          },
        },
      ],
    }).overrideComponent(AppComponent, {
      set: {
        imports: [ClarificationWizardComponent],
        template: `
          <input id="intent-input" />
          @if (showClarificationWizard()) {
            <clarityokr-clarification-wizard
              (optionSelected)="onOptionSelected($event)"
              (goBack)="onWizardBack()"
            ></clarityokr-clarification-wizard>
          }
        `,
      },
    });
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(ClarificationStateMachine);
    hosts = TestBed.inject(DraftRestoreHosts);
    fixture.autoDetectChanges();
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    jest.useRealTimers();
  });

  const restore = async (r: DraftRow) => {
    const result = await hosts.host()!.apply([r]);
    fixture.detectChanges();
    jest.advanceTimersByTime(100);
    return result;
  };
  const el = (): HTMLElement => fixture.nativeElement;
  const noModelCall = () => {
    expect(orchestrator.requestPrompt).not.toHaveBeenCalled();
    expect(orchestrator.requestNextQuestion).not.toHaveBeenCalled();
    expect(orchestrator.recordSelection).not.toHaveBeenCalled();
  };
  const noErrorShown = () => {
    expect(el().querySelector('[role="alert"]')).toBeNull();
    expect(el().querySelector('[data-testid="error-message"]')).toBeNull();
  };

  it('normal restore: back at step 3 from the saved questions, no model call, focus on the first option', async () => {
    const result = await restore(row([step(1, true), step(2, true), step(3, false)]));
    expect(result.ok).toBe(true);
    noModelCall();
    expect(el().querySelector('[data-testid="prompt-question"]')?.textContent).toContain(
      '第 3 个问题',
    );
    const options = Array.from(
      el().querySelectorAll<HTMLElement>('[data-testid="clarification-option"]'),
    );
    expect(options.map((o) => o.textContent?.includes('说明'))).toEqual([true, true, true]);
    expect(el().querySelectorAll('[aria-checked="true"]')).toHaveLength(0);
    expect(document.activeElement).toBe(options[0]);
    // no loading state, aria-busy false
    expect(el().querySelector('.loading-container')).toBeNull();
    expect(el().querySelector('.wizard-container')?.getAttribute('aria-busy')).toBe('false');
    expect(state.getStateSnapshot().selections).toEqual({ q1: 'q1-o2', q2: 'q2-o2' });
    expect(state.history()).toHaveLength(3);
    expect(component.intentControl.value).toBe('提升团队交付效率');
    noErrorShown();
  });

  it('the next answer after restore continues the saved session as usual', async () => {
    const { of } = await import('rxjs');
    orchestrator.recordSelection.mockReturnValue(of(undefined));
    orchestrator.requestNextQuestion.mockReturnValue(of(undefined));
    await restore(row([step(1, true), step(2, false)]));
    component.onOptionSelected('q2-o1');
    expect(orchestrator.recordSelection).toHaveBeenCalledWith('wiz-1', 'q2', 'q2-o1');
    expect(orchestrator.requestNextQuestion).toHaveBeenCalledWith('q2', 'q2-o1');
  });

  it('step n was still being generated: stop at step n−1 with its answer kept, focus on that card', async () => {
    await restore(row([step(1, true), step(2, true)]));
    noModelCall();
    expect(el().querySelector('[data-testid="prompt-question"]')?.textContent).toContain(
      '第 2 个问题',
    );
    const checked = el().querySelector<HTMLElement>('[aria-checked="true"]');
    expect(checked?.textContent).toContain('选项 2');
    expect(document.activeElement).toBe(checked);
    expect(el().querySelector('.loading-container')).toBeNull();
    expect(el().querySelector('.wizard-container')?.getAttribute('aria-busy')).toBe('false');
  });

  it('完成 clicked but the OKR was not generated yet: the 「可以生成」 screen, answers kept, focus on 生成 OKR', async () => {
    await restore(row([step(1, true), step(2, true)], { ready: true }));
    noModelCall();
    const generate = el().querySelector<HTMLElement>(
      '.ready-state [data-testid="clarification-generate"]',
    );
    expect(generate).not.toBeNull();
    expect(document.activeElement).toBe(generate);
    expect(state.getStateSnapshot().selections).toEqual({ q1: 'q1-o2', q2: 'q2-o2' });
  });

  it('step 3 damaged: back to step 2 (last complete before it), one local log line, no error shown', async () => {
    await restore(row([step(1, true), step(2, true), { prompt: { id: 'q3' } }]));
    noModelCall();
    expect(el().querySelector('[data-testid="prompt-question"]')?.textContent).toContain(
      '第 2 个问题',
    );
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      '[drafts] Wizard draft steps cut back on restore',
      expect.objectContaining({ reason: 'damaged', kept: 2 }),
    );
    noErrorShown();
  });

  it('step 1 damaged: goal text only at step 1, focus in the goal field, logged, no error', async () => {
    await restore(row([{ prompt: 'broken' }, step(2, false)]));
    noModelCall();
    expect(state.workflowState()).toBe('idle');
    expect(component.intentControl.value).toBe('提升团队交付效率');
    expect(document.activeElement?.id).toBe('intent-input');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    noErrorShown();
  });

  it('format number does not match: goal text only at step 1, logged, no error', async () => {
    await restore(row([step(1, true), step(2, false)], { format: WIZARD_DRAFT_FORMAT + 1 }));
    noModelCall();
    expect(state.workflowState()).toBe('idle');
    expect(state.history()).toHaveLength(0);
    expect(component.intentControl.value).toBe('提升团队交付效率');
    expect(document.activeElement?.id).toBe('intent-input');
    expect(logger.warn).toHaveBeenCalledWith(
      '[drafts] Wizard draft steps cut back on restore',
      expect.objectContaining({ reason: 'version' }),
    );
    noErrorShown();
  });

  it('old format (#115, goal only): back at step 1 as before, nothing logged', async () => {
    await restore({ kind: 'wizard', step: 2, intent: '提高团队效率' });
    noModelCall();
    expect(state.workflowState()).toBe('idle');
    expect(component.intentControl.value).toBe('提高团队效率');
    expect(document.activeElement?.id).toBe('intent-input');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('返回 after restore: the whole round is cleared as usual, back at step 1, goal kept', async () => {
    await restore(row([step(1, true), step(2, true), step(3, false)]));
    el().querySelector<HTMLElement>('.back-button')!.click();
    fixture.detectChanges();
    jest.advanceTimersByTime(10);
    expect(document.activeElement?.id).toBe('intent-input');
    expect(state.workflowState()).toBe('idle');
    expect(state.history()).toHaveLength(0);
    expect(state.getStateSnapshot().selections).toEqual({});
    expect(component.intentControl.value).toBe('提升团队交付效率');
    noModelCall();
  });

  it('Esc after restore: the whole round is cleared as usual, back at step 1, goal kept', async () => {
    await restore(row([step(1, true), step(2, true), step(3, false)]));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    jest.advanceTimersByTime(10);
    expect(document.activeElement?.id).toBe('intent-input');
    expect(state.workflowState()).toBe('idle');
    expect(state.history()).toHaveLength(0);
    expect(component.intentControl.value).toBe('提升团队交付效率');
    noModelCall();
  });

  it('rollback (draft file not updated): the wizard goes back exactly as it was', async () => {
    const result = await restore(row([step(1, true), step(2, false)]));
    result.rollback!();
    expect(state.workflowState()).toBe('idle');
    expect(state.history()).toHaveLength(0);
    expect(component.intentControl.value).toBe('');
  });

  it('the draft row saves each question, its options, the chosen option id, the session id and the format', async () => {
    await restore(row([step(1, true), step(2, false)]));
    const draft = (component as unknown as { wizardDraftRow(): DraftRow }).wizardDraftRow();
    expect(draft).toEqual(row([step(1, true), step(2, false)], { step: 3, ready: false }));
  });
});
