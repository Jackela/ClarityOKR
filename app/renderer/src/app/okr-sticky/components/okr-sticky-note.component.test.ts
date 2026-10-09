import { Component, inject } from '@angular/core';
import { By } from '@angular/platform-browser';
import type { OKRDocument } from '@clarityokr/contracts';
import { Logger } from '../../core/services/logger.service';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import { EditModeStore } from '../state/edit-mode.store';
import { OkrStickyService } from '../services/okr-sticky.service';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import type { OkrStickyViewModel } from '../services/okr-sticky.service';

import { OkrStickyNoteComponent } from './okr-sticky-note.component';

describe('OkrStickyNoteComponent', () => {
  let fixture: ComponentFixture<OkrStickyNoteComponent>;

  const viewModel: OkrStickyViewModel = {
    objective: '提升团队交付节奏',
    keyResults: [
      {
        id: 'kr-1',
        statement: '将迭代周期缩短到 3 周',
        metricLabel: '周期 <= 21 天',
        ownerLabel: '运营团队',
      },
      {
        id: 'kr-2',
        statement: '将上线缺陷率控制在 0.5%',
        metricLabel: null,
        ownerLabel: null,
      },
    ],
    generatedAt: '2025-10-31T10:12:00.000Z',
    lastEditedAt: null,
    hasManualEdits: false,
    regenerationPolicy: 'append',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OkrStickyNoteComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(OkrStickyNoteComponent);
  });

  it('renders objective and key results with metadata badges', () => {
    fixture.componentInstance.okr = viewModel;
    fixture.detectChanges();

    const objective = fixture.nativeElement.querySelector('[data-testid="sticky-objective"]');
    expect(objective).not.toBeNull();
    expect(objective.textContent).toContain('提升团队交付节奏');

    const keyResults = fixture.nativeElement.querySelectorAll('[data-testid="sticky-key-result"]');
    expect(keyResults.length).toBe(2);
    expect(keyResults.item(0).textContent).toContain('将迭代周期缩短到 3 周');

    const badgeElements = Array.from<Element>(
      fixture.nativeElement.querySelectorAll('[data-testid="sticky-kr-badge"]'),
    );
    const badges = badgeElements.map((element) => element.textContent?.trim());
    expect(badges).toContain('周期 <= 21 天');
    expect(badges).toContain('运营团队');
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
  template: `<clarityokr-sticky-note
    [okr]="gateway.viewModel()"
    (addKr)="additions = additions + 1"
  />`,
})
class StickyInteractionHost {
  readonly gateway = inject(OkrStickyService);
  additions = 0;
}

describe('Sticky note DOM with actual edit store and gateway', () => {
  const time = '2026-10-09T00:00:00.000Z';
  const original: OKRDocument = {
    id: 'component-okr',
    sourceSessionId: 'component-session',
    objective: 'Original objective',
    keyResults: [
      { id: 'first', statement: 'First result', owner: 'Team', successMetric: '90%' },
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

  function element<T extends HTMLElement = HTMLElement>(testId: string): T {
    const result = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
    if (!result) throw new Error(`Missing actual DOM control: ${testId}`);
    return result;
  }

  async function render(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function clickAndWait(
    testId: string,
    operation: 'save' | 'copy' | 'regenerate',
  ): Promise<void> {
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
    const control = element<HTMLInputElement>(testId);
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
    invoke = jest.fn().mockResolvedValue(original);
    window.clarifyOkr = { invoke, send: jest.fn(), on: () => jest.fn() };
    await TestBed.configureTestingModule({
      imports: [StickyInteractionHost],
      providers: [
        { provide: Logger, useValue: { debug: jest.fn(), info: jest.fn(), error: jest.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StickyInteractionHost);
    fixture.detectChanges();
    await render();
    store = TestBed.inject(EditModeStore);
    note = fixture.debugElement.query(By.directive(OkrStickyNoteComponent)).componentInstance;
    invoke.mockClear();
  });

  afterEach(() => {
    fixture.destroy();
    delete window.clarifyOkr;
  });

  it('edits actual inputs, cancels without IPC, and emits both add-key-result controls', async () => {
    const additions = fixture.nativeElement.querySelectorAll('[data-testid="sticky-add-kr"]');
    additions.forEach((button: HTMLButtonElement) => button.click());
    expect(fixture.componentInstance.additions).toBe(2);
    await enterEdit();
    expect(element<HTMLInputElement>('objective-input').value).toBe(original.objective);
    expect(element<HTMLButtonElement>('save-button').disabled).toBe(true);
    await input('objective-input', 'Unsaved objective');
    await input('kr-input-0', 'Unsaved result');
    expect(store.draftObjective()).toBe('Unsaved objective');
    expect(store.draftKeyResults()[0].statement).toBe('Unsaved result');
    element('cancel-button').click();
    await render();
    expect(store.isEditing()).toBe(false);
    expect(element('sticky-objective').textContent).toBe(original.objective);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('disables invalid and clean saves, then saves real acknowledged data with metadata preserved', async () => {
    await enterEdit();
    await note.save();
    expect(invoke).not.toHaveBeenCalled();
    await input('objective-input', ' ');
    expect(store.isValid()).toBe(false);
    expect(element<HTMLButtonElement>('save-button').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    await note.save();
    expect(invoke).not.toHaveBeenCalled();
    await input('objective-input', 'Edited objective');
    await input('kr-input-1', 'Edited second result');
    const acknowledged = {
      ...edited(),
      keyResults: [original.keyResults[0], { id: 'second', statement: 'Edited second result' }],
    };
    invoke.mockResolvedValueOnce(acknowledged);
    await clickAndWait('save-button', 'save');
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.OKR_UPDATE, {
      id: original.id,
      objective: 'Edited objective',
      keyResults: [
        original.keyResults[0],
        {
          id: 'second',
          statement: 'Edited second result',
          owner: undefined,
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
    await input('objective-input', 'Edited objective');
    invoke.mockImplementationOnce(async () => {
      throw new Error('Save rejected');
    });
    await clickAndWait('save-button', 'save');
    expect(store.isEditing()).toBe(true);
    expect(store.draftObjective()).toBe('Edited objective');
    expect(element('sticky-error').textContent).toBe('Save rejected');
    expect(note.busy()).toBe(false);
    invoke.mockResolvedValueOnce(edited());
    await clickAndWait('save-button', 'save');
    expect(store.isEditing()).toBe(false);
    expect(note.error()).toBeNull();
  });

  it('does not cancel an acknowledged save while its IPC response is pending', async () => {
    await enterEdit();
    await input('objective-input', 'Edited objective');
    let resolve: (value: unknown) => void = () => {
      throw new Error('Missing controlled response');
    };
    invoke.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    element('save-button').click();
    fixture.detectChanges();
    try {
      expect(note.busy()).toBe(true);
      expect(element('cancel-button').matches(':disabled')).toBe(true);
      expect(element('objective-input').matches(':disabled')).toBe(true);
      await note.save();
      expect(invoke).toHaveBeenCalledTimes(1);
      note.cancel();
      element('cancel-button').click();
      fixture.detectChanges();
      expect(store.isEditing()).toBe(true);
    } finally {
      resolve(edited());
      await render();
    }
    expect(store.isEditing()).toBe(false);
    expect(element('sticky-objective').textContent).toBe('Edited objective');
    expect(note.error()).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('copies through the actual service and reports both success and permission failure', async () => {
    invoke.mockResolvedValueOnce(true);
    await clickAndWait('copy-button', 'copy');
    expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.CLIPBOARD_EXPORT, { okrId: original.id });
    expect(element('copy-success').textContent).toContain('已复制');
    invoke.mockImplementationOnce(async () => {
      throw 'Permission denied';
    });
    await clickAndWait('copy-button', 'copy');
    expect(fixture.nativeElement.querySelector('[data-testid="copy-success"]')).toBeNull();
    expect(element('sticky-error').textContent).toBe('Permission denied');
    expect(note.busy()).toBe(false);
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
      expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.OKR_REGENERATE, {
        sessionId: original.sourceSessionId,
        policy,
      });
      expect(element('sticky-objective').textContent).toBe('Regenerated objective');
      expect(note.showPolicies()).toBe(false);
      expect(note.busy()).toBe(false);
    },
  );

  it('ignores edit requests while regeneration is pending and prevents duplicate copy dispatch', async () => {
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
    element('edit-button').click();
    expect(store.isEditing()).toBe(false);
    resolve({ ...original, objective: 'Regenerated objective' });
    await regenerating;
    await render();
    invoke.mockClear();
    invoke.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const copying = note.copy();
    await note.copy();
    expect(invoke).toHaveBeenCalledTimes(1);
    resolve(true);
    await copying;
    await render();
    expect(element('copy-success')).not.toBeNull();
    expect(note.error()).toBeNull();
    note.cancel();
    expect(store.isEditing()).toBe(false);
  });
});
