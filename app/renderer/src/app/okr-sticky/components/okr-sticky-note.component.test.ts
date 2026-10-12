import { Component, inject } from '@angular/core';
import { By } from '@angular/platform-browser';
import type { OKRDocument } from '@clarityokr/contracts';
import { Logger } from '../../core/services/logger.service';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import { ClosedLoopStore } from '../../closed-loop/closed-loop.store';
import { makeDetail, makeKr } from '../../closed-loop/testing/fixtures';
import { EditModeStore } from '../state/edit-mode.store';
import { OkrStickyService } from '../services/okr-sticky.service';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import type { OkrStickyViewModel } from '../services/okr-sticky.service';

import { OkrStickyNoteComponent } from './okr-sticky-note.component';

/** Lets the promise chain of a mocked IPC call (bridge → api → store) finish. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('OkrStickyNoteComponent', () => {
  let fixture: ComponentFixture<OkrStickyNoteComponent>;

  const viewModel: OkrStickyViewModel = {
    id: 'okr-1',
    objective: '提升团队交付节奏',
    keyResults: [
      {
        id: 'kr-1',
        statement: '将迭代周期缩短到 3 周',
        metricLabel: '周期 <= 21 天',
      },
      {
        id: 'kr-2',
        statement: '将上线缺陷率控制在 0.5%',
        metricLabel: null,
      },
    ],
    generatedAt: '2025-10-31T10:12:00.000Z',
    lastEditedAt: null,
    hasManualEdits: false,
    regenerationPolicy: 'append',
  };

  beforeEach(async () => {
    window.clarifyOkr = {
      invoke: jest.fn().mockResolvedValue({
        ok: true,
        data: makeDetail([
          makeKr({
            id: 'kr-1',
            statement: '将迭代周期缩短到 3 周',
            successMetric: '周期 <= 21 天',
          }),
          makeKr({ id: 'kr-2', position: 1, statement: '将上线缺陷率控制在 0.5%' }),
        ]),
      }),
      send: jest.fn(),
      on: () => jest.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [OkrStickyNoteComponent],
      providers: [
        {
          provide: Logger,
          useValue: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OkrStickyNoteComponent);
  });

  afterEach(() => {
    delete window.clarifyOkr;
  });

  it('renders objective and key results with their metric and no owner / metric badges', async () => {
    fixture.componentInstance.okr = viewModel;
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const objective = fixture.nativeElement.querySelector('[data-testid="sticky-objective"]');
    expect(objective).not.toBeNull();
    expect(objective.textContent).toContain('提升团队交付节奏');

    const keyResults = fixture.nativeElement.querySelectorAll('[data-testid="sticky-key-result"]');
    expect(keyResults.length).toBe(2);
    expect(keyResults.item(0).textContent).toContain('将迭代周期缩短到 3 周');

    expect(fixture.nativeElement.querySelectorAll('[data-testid="sticky-kr-badge"]').length).toBe(
      0,
    );
    expect(fixture.nativeElement.textContent).not.toContain('运营团队');
    const metric = fixture.nativeElement.querySelector('[data-testid="kr-metric"]');
    expect(metric.textContent.trim()).toBe('度量：周期 <= 21 天');
    // The second key result has no metric: an "add metric" button instead of an empty line.
    expect(fixture.nativeElement.querySelectorAll('[data-testid="kr-add-metric"]').length).toBe(1);
  });

  it('hides content when no OKR is provided', () => {
    fixture.componentInstance.okr = null;
    fixture.detectChanges();

    const objective = fixture.nativeElement.querySelector('[data-testid="sticky-objective"]');
    expect(objective).toBeNull();
  });
});

@Component({
  standalone: true,
  imports: [OkrStickyNoteComponent],
  template: `<clarityokr-sticky-note [okr]="gateway.viewModel()" />`,
})
class StickyInteractionHost {
  readonly gateway = inject(OkrStickyService);
}

describe('Sticky note DOM with actual edit store and gateway', () => {
  const time = '2026-10-09T00:00:00.000Z';
  const original: OKRDocument = {
    id: 'component-okr',
    sourceSessionId: 'component-session',
    objective: 'Original objective',
    keyResults: [
      { id: 'first', statement: 'First result', successMetric: '90%' },
      { id: 'second', statement: 'Second result' },
    ],
    generatedAt: time,
    regenerationPolicy: 'append',
    manualEdits: [],
  };
  let fixture: ComponentFixture<StickyInteractionHost>;
  let store: EditModeStore;
  let note: OkrStickyNoteComponent;
  let invoke: jest.Mock;

  /** Calls of the legacy channels only (the closed-loop reads are asserted elsewhere). */
  function legacyCalls(): unknown[][] {
    return invoke.mock.calls.filter(([channel]) => channel !== IPC_CHANNELS.OKR_OPEN);
  }

  function element<T extends HTMLElement = HTMLElement>(testId: string): T {
    const result = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
    if (!result) throw new Error(`Missing actual DOM control: ${testId}`);
    return result;
  }

  async function render(): Promise<void> {
    await fixture.whenStable();
    await settle();
    fixture.detectChanges();
  }

  async function clickAndWait(testId: string, operation: 'save' | 'regenerate'): Promise<void> {
    // Observe the actual public async completion; no gateway/store behavior is replaced.
    const observed = jest.spyOn(note, operation);
    try {
      element(testId).click();
      expect(observed).toHaveBeenCalledTimes(1);
      await observed.mock.results[0].value;
      await render();
    } finally {
      observed.mockRestore();
    }
  }

  async function enterEdit(): Promise<void> {
    element('edit-button').click();
    fixture.detectChanges();
    await render();
  }

  async function input(testId: string, text: string): Promise<void> {
    const control = element<HTMLTextAreaElement>(testId);
    control.value = text;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await render();
  }

  function edited(objective = 'Edited objective'): OKRDocument {
    return {
      ...original,
      objective,
      lastEditedAt: time,
      manualEdits: [
        {
          id: 'edit',
          fieldPath: 'objective',
          previousValue: original.objective,
          newValue: objective,
          editedAt: time,
        },
      ],
    };
  }

  beforeEach(async () => {
    invoke = jest.fn().mockImplementation(async (channel: string) => {
      if (channel === IPC_CHANNELS.OKR_OPEN) {
        return {
          ok: true,
          data: makeDetail(
            [
              makeKr({ id: 'first', objectiveId: original.id, statement: 'First result' }),
              makeKr({
                id: 'second',
                objectiveId: original.id,
                position: 1,
                statement: 'Second result',
              }),
            ],
            { id: original.id },
          ),
        };
      }
      return original;
    });
    window.clarifyOkr = { invoke, send: jest.fn(), on: () => jest.fn() };
    await TestBed.configureTestingModule({
      imports: [StickyInteractionHost],
      providers: [
        {
          provide: Logger,
          useValue: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StickyInteractionHost);
    fixture.detectChanges();
    await render(); // hydrates the document
    await render(); // loads the closed-loop detail for it
    store = TestBed.inject(EditModeStore);
    note = fixture.debugElement.query(By.directive(OkrStickyNoteComponent)).componentInstance;
    invoke.mockClear();
  });

  afterEach(() => {
    fixture.destroy();
    delete window.clarifyOkr;
  });

  it('edits actual inputs, cancels without IPC, and emits the single add-key-result control', async () => {
    const additions = fixture.nativeElement.querySelectorAll('[data-testid="sticky-add-kr"]');
    expect(additions.length).toBe(1);
    await enterEdit();
    expect(element<HTMLTextAreaElement>('edit-objective').value).toBe(original.objective);
    expect(element<HTMLButtonElement>('edit-save').disabled).toBe(true);
    await input('edit-objective', 'Unsaved objective');
    await input('edit-kr-0', 'Unsaved result');
    expect(store.draftObjective()).toBe('Unsaved objective');
    expect(store.draftKeyResults()[0].statement).toBe('Unsaved result');
    element('edit-cancel').click();
    await render();
    // unsaved changes: asks first (spec §3.9); 放弃 throws them away
    expect(element('discard-dialog').textContent).toContain('放弃未保存的修改？');
    element('dialog-confirm').click();
    await render();
    expect(store.isEditing()).toBe(false);
    expect(element('sticky-objective').textContent).toBe(original.objective);
    expect(legacyCalls()).toEqual([]);
  });

  it('blur and paste in the real form start a new undo step (spec §3.9)', async () => {
    await enterEdit();
    await input('edit-objective', 'One');
    await input('edit-objective', 'One two');
    element('edit-objective').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await input('edit-objective', 'One two three');
    element('edit-objective').dispatchEvent(new Event('paste', { bubbles: true }));
    await input('edit-objective', 'One two three PASTED');
    await input('edit-objective', 'One two three PASTED more');
    // typing after the paste is a step of its own
    store.undo();
    expect(store.draftObjective()).toBe('One two three PASTED');
    store.undo();
    expect(store.draftObjective()).toBe('One two three');
    store.undo();
    expect(store.draftObjective()).toBe('One two');
    store.undo();
    expect(store.draftObjective()).toBe(original.objective);
  });

  it('disables invalid and clean saves, then saves real acknowledged data with metadata preserved', async () => {
    await enterEdit();
    await note.save();
    expect(legacyCalls()).toEqual([]);
    await input('edit-objective', ' ');
    expect(store.isValid()).toBe(false);
    expect(element<HTMLButtonElement>('edit-save').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    await note.save();
    expect(legacyCalls()).toEqual([]);
    await input('edit-objective', 'Edited objective');
    await input('edit-kr-1', 'Edited second result');
    const acknowledged = {
      ...edited(),
      keyResults: [original.keyResults[0], { id: 'second', statement: 'Edited second result' }],
    };
    invoke.mockResolvedValueOnce(acknowledged);
    await clickAndWait('edit-save', 'save');
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.OKR_UPDATE, {
      id: original.id,
      objective: 'Edited objective',
      keyResults: [
        original.keyResults[0],
        {
          id: 'second',
          statement: 'Edited second result',
          successMetric: undefined,
        },
      ],
    });
    expect(store.isEditing()).toBe(false);
    expect(element('sticky-objective').textContent).toBe('Edited objective');
    expect(element('sticky-manual-edits').textContent).toContain('含手动修改');
    expect(note.error()).toBeNull();
  });

  it('keeps editable drafts and shows failure when saving is rejected, allowing a retry', async () => {
    await enterEdit();
    await input('edit-objective', 'Edited objective');
    invoke.mockImplementationOnce(async () => {
      throw new Error('Save rejected');
    });
    await clickAndWait('edit-save', 'save');
    expect(store.isEditing()).toBe(true);
    expect(store.draftObjective()).toBe('Edited objective');
    // the raw error is never shown; the text stays and the form says so
    expect(element('edit-save-failed').textContent).toContain('没能保存，你写的内容还在。');
    expect(fixture.nativeElement.textContent).not.toContain('Save rejected');
    expect(note.busy()).toBe(false);
    invoke.mockResolvedValueOnce(edited());
    await clickAndWait('edit-save', 'save');
    expect(store.isEditing()).toBe(false);
    expect(note.error()).toBeNull();
  });

  it('does not cancel an acknowledged save while its IPC response is pending', async () => {
    await enterEdit();
    await input('edit-objective', 'Edited objective');
    let resolve: (value: unknown) => void = () => {
      throw new Error('Missing controlled response');
    };
    invoke.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    element('edit-save').click();
    fixture.detectChanges();
    try {
      expect(note.busy()).toBe(true);
      expect(element('edit-cancel').matches(':disabled')).toBe(true);
      expect(element<HTMLTextAreaElement>('edit-objective').readOnly).toBe(true);
      await note.save();
      expect(legacyCalls()).toHaveLength(1);
      note.cancel();
      element('edit-cancel').click();
      fixture.detectChanges();
      expect(store.isEditing()).toBe(true);
    } finally {
      resolve(edited());
      await render();
    }
    expect(store.isEditing()).toBe(false);
    expect(element('sticky-objective').textContent).toBe('Edited objective');
    expect(note.error()).toBeNull();
    expect(legacyCalls()).toHaveLength(1);
  });

  it('has no 「复制」 button any more: copying is an item of the export menu', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="copy-button"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="copy-success"]')).toBeNull();
    expect(note).not.toHaveProperty('copy');
  });

  it.each(['overwrite', 'append'] as const)(
    'dispatches the actual %s regeneration policy and shows server data',
    async (policy) => {
      element('regenerate-button').click();
      fixture.detectChanges();
      invoke.mockResolvedValueOnce({
        ...original,
        objective: 'Regenerated objective',
        regenerationPolicy: policy,
      });
      await clickAndWait(`policy-${policy}`, 'regenerate');
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.OKR_REGENERATE, {
        sessionId: original.sourceSessionId,
        policy,
      });
      expect(element('sticky-objective').textContent).toBe('Regenerated objective');
      expect(note.showPolicies()).toBe(false);
      expect(note.busy()).toBe(false);
    },
  );

  it('ignores edit requests while regeneration is pending and says so in the store', async () => {
    let resolve: (value: unknown) => void = () => {
      throw new Error('Missing controlled response');
    };
    invoke.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const regenerating = note.regenerate('append');
    expect(TestBed.inject(ClosedLoopStore).regenerating()).toBe(true);
    element('edit-button').click();
    expect(store.isEditing()).toBe(false);
    resolve({ ...original, objective: 'Regenerated objective' });
    await regenerating;
    await render();
    expect(TestBed.inject(ClosedLoopStore).regenerating()).toBe(false);
    expect(note.error()).toBeNull();
    note.cancel();
    expect(store.isEditing()).toBe(false);
  });
});
