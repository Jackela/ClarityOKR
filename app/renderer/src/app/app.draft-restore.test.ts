import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DraftRow } from '@clarityokr/contracts';

import { AppComponent } from './app.component';
import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
import { ClarificationStateMachine } from './clarification/services/clarification-state-machine.service';
import { ClosedLoopApi } from './closed-loop/closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop/closed-loop.store';
import { EditModeStore } from './okr-sticky/state/edit-mode.store';
import {
  DraftRestoreHosts,
  structuralTarget,
  textEditDraftRows,
  textEditTarget,
} from './closed-loop/draft-restore';
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
    originalObjective: () => 'x',
    draftObjective: () => 'x',
    updateKeyResult: jest.fn(),
    checkpoint: jest.fn(() => 0),
    rollbackTo: jest.fn(),
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
    expect(n.restoreDraft).toHaveBeenCalledWith({
      objective: undefined,
      krs: [{ krId: 'k9', statement: 'B', successMetric: '' }],
      added: [],
    });
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

  it('write fails after the switch: rollback drops the restored edits and stays on the switched OKR', async () => {
    note(true);
    openFromHistory.mockImplementation(async (id: string) => {
      shown.set({ ...vm, id });
      return true;
    });
    const done = hosts.host()!.apply([other]);
    await jest.runAllTimersAsync();
    const result = await done;
    expect(result.ok).toBe(true);
    editor.cancelEdits.mockClear();
    result.rollback!();
    expect(editor.cancelEdits).toHaveBeenCalledTimes(1);
    expect(shown().id).toBe('o2');
    expect(openFromHistory).toHaveBeenCalledTimes(1);
  });

  it('#117: objective + added KRs on the shown OKR → restored into the note, focus on the objective', async () => {
    const n = note(true);
    const focus = jest.fn();
    jest
      .spyOn(document, 'querySelector')
      .mockImplementation(((sel: string) =>
        sel === '[id="edit-objective"]' ? ({ focus } as unknown as Element) : null) as never);
    const done = hosts.host()!.apply([
      { kind: 'objective', okrId: 'o1', base: 'x', draft: '新目标' },
      { kind: 'addedKr', okrId: 'o1', krs: [{ id: 'n1', statement: 'C', successMetric: '' }] },
    ]);
    await jest.runAllTimersAsync();
    expect((await done).ok).toBe(true);
    expect(n.restoreDraft).toHaveBeenCalledWith({
      objective: '新目标',
      krs: [],
      added: [{ id: 'n1', statement: 'C', successMetric: '' }],
    });
    expect(focus).toHaveBeenCalled();
    (document.querySelector as jest.Mock).mockRestore();
  });

  it('#117: only added KRs → focus on the first added key result', async () => {
    note(true);
    const seen: string[] = [];
    jest.spyOn(document, 'querySelector').mockImplementation(((sel: string) => {
      seen.push(sel);
      return null;
    }) as never);
    const done = hosts
      .host()!
      .apply([
        { kind: 'addedKr', okrId: 'o1', krs: [{ id: 'n1', statement: 'C', successMetric: '' }] },
      ]);
    await jest.runAllTimersAsync();
    expect((await done).ok).toBe(true);
    expect(seen).toContain('[id="edit-kr-n1"]');
    (document.querySelector as jest.Mock).mockRestore();
  });

  it('#117 S3-05: write fails while already editing → back to the checkpoint (added KRs gone)', async () => {
    note(true);
    editor.isEditing.mockReturnValue(true);
    editor.checkpoint.mockReturnValue(3);
    editor.rollbackTo.mockClear();
    const done = hosts
      .host()!
      .apply([
        { kind: 'addedKr', okrId: 'o1', krs: [{ id: 'n1', statement: 'C', successMetric: '' }] },
      ]);
    await jest.runAllTimersAsync();
    const result = await done;
    result.rollback!();
    expect(editor.rollbackTo).toHaveBeenCalledWith(3);
    expect(editor.cancelEdits).not.toHaveBeenCalled();
  });

  it('#117 targetOf objective / added rows uses the OKR shown; another OKR shown → untouched', () => {
    const objective = { kind: 'objective' as const, okrId: 'o1', base: 'x', draft: 'y' };
    expect(hosts.host()!.targetOf(objective)).toBe('untouched');
    expect(hosts.host()!.targetOf({ ...objective, base: 'older' })).toBe('saved');
    expect(hosts.host()!.targetOf({ ...objective, okrId: 'o2', base: 'older' })).toBe('untouched');
    const added = {
      kind: 'addedKr' as const,
      okrId: 'o1',
      krs: [{ id: 'k1', statement: 'A', successMetric: '' }],
    };
    expect(hosts.host()!.targetOf(added)).toBe('saved');
  });

  it('#118: wizard has input AND the note has edits → switching asks the note’s own confirm; wizard kept', async () => {
    const n = note(false);
    component.intentControl.setValue('提高团队效率');
    editor.isEditing.mockReturnValue(true);
    editor.isDirty.mockReturnValue(true);
    const done = hosts.host()!.apply([other]);
    await jest.runAllTimersAsync();
    expect(await done).toEqual({ ok: false, cancelled: true });
    // the confirm is the note's 「放弃未保存的修改？」 (body 「你修改的文字还没有保存。」, see the
    // note's test); the wizard input is neither asked about nor dropped
    expect(n.confirmDiscard).toHaveBeenCalledTimes(1);
    expect(component.intentControl.value).toBe('提高团队效率');
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
    originalObjective: () => 'O',
    draftObjective: () => 'O',
    originalKeyResults: () => [
      { id: 'k1', statement: 'A', successMetric: 'm' },
      { id: 'k2', statement: 'B', successMetric: '' },
    ],
    draftKeyResults: () => draft,
  });

  it('one row per existing KR whose text changed; added KRs in one addedKr row (#117)', () => {
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
      {
        kind: 'addedKr',
        okrId: 'o1',
        krs: [{ id: 'new', statement: 'C', successMetric: '' }],
      },
    ]);
  });

  it('#117 case 1: only the objective changed → one objective row, base = the objective then', () => {
    const rows = textEditDraftRows(
      {
        ...editor([
          { id: 'k1', statement: 'A', successMetric: 'm' },
          { id: 'k2', statement: 'B' },
        ]),
        draftObjective: () => 'O2',
      },
      'o1',
    );
    expect(rows).toEqual([{ kind: 'objective', okrId: 'o1', base: 'O', draft: 'O2' }]);
  });

  it('#117 case 2: an added key result left empty is still drafted (the quit gate stops it too)', () => {
    const rows = textEditDraftRows(
      editor([
        { id: 'k1', statement: 'A', successMetric: 'm' },
        { id: 'k2', statement: 'B' },
        { id: 'n1', statement: '' },
        { id: 'n2', statement: 'D', successMetric: 'x' },
      ]),
      'o1',
    );
    expect(rows).toEqual([
      {
        kind: 'addedKr',
        okrId: 'o1',
        krs: [
          { id: 'n1', statement: '', successMetric: '' },
          { id: 'n2', statement: 'D', successMetric: 'x' },
        ],
      },
    ]);
  });

  it('#117 rule 1 for objective / added rows: saved since the draft / dirty / untouched', () => {
    const objective = { kind: 'objective' as const, okrId: 'o1', base: 'O', draft: 'O2' };
    const added = {
      kind: 'addedKr' as const,
      okrId: 'o1',
      krs: [{ id: 'n1', statement: 'C', successMetric: '' }],
    };
    const saved = { objective: 'O', keyResultIds: ['k1'] };
    expect(structuralTarget(objective, { ...saved, objective: 'O3' }, false)).toBe('saved');
    expect(structuralTarget(objective, saved, true)).toBe('dirty');
    expect(structuralTarget(objective, saved, false)).toBe('untouched');
    expect(structuralTarget(added, { ...saved, keyResultIds: ['k1', 'n1'] }, false)).toBe('saved');
    expect(structuralTarget(added, saved, true)).toBe('dirty');
    expect(structuralTarget(added, null, false)).toBe('untouched');
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
