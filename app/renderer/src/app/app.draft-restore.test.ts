import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DraftRow } from '@clarityokr/contracts';

import { AppComponent } from './app.component';
import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
import { ClarificationStateMachine } from './clarification/services/clarification-state-machine.service';
import { ClosedLoopApi } from './closed-loop/closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop/closed-loop.store';
import { EditModeStore } from './okr-sticky/state/edit-mode.store';
import { DraftRestoreHosts, textEditDraftRows, textEditTarget } from './closed-loop/draft-restore';
import { Logger } from './core/services/logger.service';
import { OkrStickyService } from './okr-sticky/services/okr-sticky.service';

/** #110 in the main window: wizard + its own KR text edit (产品经理 decision 2①). */
describe('AppComponent: main-window draft restore', () => {
  const state = {
    reset: jest.fn(),
    workflowState: signal('idle'),
    history: signal<unknown[]>([]),
    hasPrompt: () => false,
    hasError: () => false,
  };
  let component: AppComponent;
  let hosts: DraftRestoreHosts;
  const shown = signal<{ id: string; objective: string; keyResults: unknown[] }>(null as never);
  const openFromHistory = jest.fn();
  const editor = {
    isEditing: jest.fn(() => false),
    isDirty: jest.fn(() => false),
    cancelEdits: jest.fn(),
    originalKeyResults: () => [],
    draftKeyResults: () => [],
    updateKeyResult: jest.fn(),
  };
  const vm = {
    id: 'o1',
    objective: 'x',
    keyResults: [{ id: 'k1', statement: 'A', metricLabel: 'm' }],
  };

  beforeEach(() => {
    jest.useFakeTimers();
    shown.set(vm);
    openFromHistory.mockReset();
    editor.isEditing.mockReturnValue(false);
    editor.isDirty.mockReturnValue(false);
    editor.cancelEdits.mockClear();
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: ClarificationStateMachine, useValue: state },
        { provide: ClarificationOrchestratorService, useValue: {} },
        { provide: OkrStickyService, useValue: { getCurrentViewModel: () => shown() } },
        { provide: ClosedLoopStore, useValue: { openFromHistory } },
        { provide: EditModeStore, useValue: editor },
        { provide: Logger, useValue: {} },
        {
          provide: ClosedLoopApi,
          useValue: {
            onEvent: () => jest.fn(),
            reportUnsaved: jest.fn().mockResolvedValue({ ok: true }),
            reportDraft: jest.fn().mockResolvedValue({ ok: true }),
          },
        },
      ],
    }).overrideComponent(AppComponent, { set: { template: '', imports: [] } });
    component = TestBed.createComponent(AppComponent).componentInstance;
    hosts = TestBed.inject(DraftRestoreHosts);
  });

  afterEach(() => jest.useRealTimers());

  it('rollback puts the goal back with its validation state: pristine, untouched, no hint', async () => {
    const c = component.intentControl;
    expect(c.pristine && c.untouched).toBe(true);
    const result = await hosts.host()!.apply([{ kind: 'wizard', step: 1, intent: '提高团队效率' }]);
    expect(c.value).toBe('提高团队效率');
    c.markAsTouched(); // the user tabbed through the field
    result.rollback!();
    jest.runAllTimers();
    expect(c.value).toBe('');
    expect(c.pristine).toBe(true);
    expect(c.untouched).toBe(true);
    // the hint 「请输入至少3个字符」 shows only for invalid && touched
    expect(c.invalid && c.touched).toBe(false);
  });

  const other: DraftRow = {
    kind: 'textEdit',
    okrId: 'o2',
    krId: 'k9',
    base: { statement: 'A', successMetric: '' },
    draft: { statement: 'B', successMetric: '' },
  };
  const note = (answer: boolean) => {
    const restoreDraft = jest.fn(() => true);
    const confirmDiscard = jest.fn().mockResolvedValue(answer);
    (component as unknown as { mainNoteRef: unknown }).mainNoteRef = {
      restoreDraft,
      confirmDiscard,
    };
    return { restoreDraft, confirmDiscard };
  };

  it('draft OKR not shown: 恢复 switches to it first, then restores (not a failure)', async () => {
    const n = note(true);
    openFromHistory.mockImplementation(async (id: string) => {
      shown.set({ ...vm, id });
      return true;
    });
    expect(hosts.host()!.targetOf(other)).toBe('untouched');
    const done = hosts.host()!.apply([other]);
    await jest.runAllTimersAsync();
    expect(await done).toEqual(expect.objectContaining({ ok: true }));
    expect(openFromHistory).toHaveBeenCalledWith('o2');
    expect(n.confirmDiscard).not.toHaveBeenCalled();
    expect(n.restoreDraft).toHaveBeenCalledWith([
      { krId: 'k9', statement: 'B', successMetric: '' },
    ]);
  });

  it('switch with unsaved edits: 继续编辑 (cancel) → nothing changes, cancelled (no failure line)', async () => {
    const n = note(false);
    editor.isEditing.mockReturnValue(true);
    editor.isDirty.mockReturnValue(true);
    const done = hosts.host()!.apply([other]);
    await jest.runAllTimersAsync();
    expect(await done).toEqual({ ok: false, cancelled: true });
    expect(openFromHistory).not.toHaveBeenCalled();
    expect(editor.cancelEdits).not.toHaveBeenCalled();
    expect(n.restoreDraft).not.toHaveBeenCalled();
    expect(shown().id).toBe('o1');
  });

  it('switch with unsaved edits: 放弃修改 (don’t save) → the edits go, switch, then restore', async () => {
    const n = note(true);
    editor.isEditing.mockReturnValue(true);
    editor.isDirty.mockReturnValue(true);
    openFromHistory.mockImplementation(async (id: string) => {
      shown.set({ ...vm, id });
      return true;
    });
    const done = hosts.host()!.apply([other]);
    await jest.runAllTimersAsync();
    expect((await done).ok).toBe(true);
    expect(n.confirmDiscard).toHaveBeenCalled();
    expect(editor.cancelEdits).toHaveBeenCalled();
    expect(n.restoreDraft).toHaveBeenCalled();
  });

  it('a real failure opening the OKR after the switch → ok:false (the existing failure line)', async () => {
    note(true);
    openFromHistory.mockResolvedValue(false);
    const done = hosts.host()!.apply([other]);
    await jest.runAllTimersAsync();
    expect(await done).toEqual({ ok: false });
  });

  it('targetOf a text edit row: saved since → saved; untouched otherwise', () => {
    const row = {
      kind: 'textEdit' as const,
      okrId: 'o1',
      krId: 'k1',
      base: { statement: 'A', successMetric: 'm' },
      draft: { statement: 'B', successMetric: 'm' },
    };
    expect(hosts.host()!.targetOf(row)).toBe('untouched');
    expect(hosts.host()!.targetOf({ ...row, base: { statement: 'old', successMetric: 'm' } })).toBe(
      'saved',
    );
  });
});

describe('textEditDraftRows / textEditTarget (both windows)', () => {
  const editor = (draft: { id: string; statement: string; successMetric?: string }[]) => ({
    isEditing: () => true,
    isDirty: () => true,
    originalKeyResults: () => [
      { id: 'k1', statement: 'A', successMetric: 'm' },
      { id: 'k2', statement: 'B', successMetric: '' },
    ],
    draftKeyResults: () => draft,
  });

  it('one row per existing KR whose statement or successMetric changed; new KRs skipped', () => {
    const rows = textEditDraftRows(
      editor([
        { id: 'k1', statement: 'A2', successMetric: 'm' },
        { id: 'k2', statement: 'B' },
        { id: 'new', statement: 'C' },
      ]),
      'o1',
    );
    expect(rows).toEqual([
      {
        kind: 'textEdit',
        okrId: 'o1',
        krId: 'k1',
        base: { statement: 'A', successMetric: 'm' },
        draft: { statement: 'A2', successMetric: 'm' },
      },
    ]);
  });

  it('not editing → no rows', () => {
    expect(textEditDraftRows({ ...editor([]), isEditing: () => false }, 'o1')).toEqual([]);
  });

  it('the three cases: saved / dirty / untouched', () => {
    const row = {
      kind: 'textEdit' as const,
      okrId: 'o1',
      krId: 'k1',
      base: { statement: 'A', successMetric: 'm' },
      draft: { statement: 'A2', successMetric: 'm' },
    };
    expect(textEditTarget(row, [{ id: 'k1', statement: 'saved', successMetric: 'm' }], false)).toBe(
      'saved',
    );
    expect(textEditTarget(row, [{ id: 'k1', statement: 'A', successMetric: 'm' }], true)).toBe(
      'dirty',
    );
    expect(textEditTarget(row, [{ id: 'k1', statement: 'A', successMetric: 'm' }], false)).toBe(
      'untouched',
    );
  });
});
