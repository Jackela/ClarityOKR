import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DraftRow } from '@clarityokr/contracts';

import { AppComponent } from './app.component';
import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
import { ClarificationStateMachine } from './clarification/services/clarification-state-machine.service';
import { ClosedLoopApi } from './closed-loop/closed-loop-api.service';
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
  const vm = {
    id: 'o1',
    objective: 'x',
    keyResults: [{ id: 'k1', statement: 'A', metricLabel: 'm' }],
  };

  beforeEach(() => {
    jest.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: ClarificationStateMachine, useValue: state },
        { provide: ClarificationOrchestratorService, useValue: {} },
        { provide: OkrStickyService, useValue: { getCurrentViewModel: () => vm } },
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

  it('a text edit row of an OKR the main window does not show cannot be restored here', async () => {
    const row: DraftRow = {
      kind: 'textEdit',
      okrId: 'other',
      krId: 'k1',
      base: { statement: 'A', successMetric: 'm' },
      draft: { statement: 'B', successMetric: 'm' },
    };
    expect(await hosts.host()!.apply([row])).toEqual({ ok: false });
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
