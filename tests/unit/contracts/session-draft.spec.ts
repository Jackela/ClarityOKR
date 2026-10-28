import {
  combineRestoreActions,
  draftFileSchema,
  draftRowKey,
  draftsEnabled,
  filterDraftRows,
  restoreAction,
  sortDraftRows,
  truncateDraftTitle,
  type DraftRow,
} from '@clarityokr/contracts';

/** #110 (new-1) decision logic shared by the main process and the renderer (spec S3§12). */
describe('S3§12.5 v3.3 OKR title truncation (9 grapheme clusters + 「…」)', () => {
  it.each([
    ['提升团队交付效率与质量', '提升团队交付效率与…'],
    ['Q4 提升 API 稳定性', 'Q4 提升 API…'],
    ['👨‍👩‍👧家庭与🚀增长双线目标', '👨‍👩‍👧家庭与🚀增长双线…'],
    ['提升团队交付效率与质', '提升团队交付效率与质'],
    ['提升团队交付效率 OK 计划', '提升团队交付效率…'],
    ['提升团队交付效率', '提升团队交付效率'],
  ])('%s → %s', (title, shown) => {
    expect(truncateDraftTitle(title)).toBe(shown);
  });

  it('strips trailing U+3000 too, and never adds clusters back', () => {
    expect(truncateDraftTitle('提升团队交付效率\u3000\u3000计划')).toBe('提升团队交付效率…');
  });

  it('never splits a ZWJ sequence: a family emoji counts 1', () => {
    expect(truncateDraftTitle('👨‍👩‍👧'.repeat(10))).toBe('👨‍👩‍👧'.repeat(10));
    expect(truncateDraftTitle('👨‍👩‍👧'.repeat(11))).toBe(`${'👨‍👩‍👧'.repeat(9)}…`);
  });
});

describe('when a draft is written / offered', () => {
  it('in-memory database mode: no drafts, no prompt', () => {
    expect(draftsEnabled('memory')).toBe(false);
    expect(draftsEnabled('normal')).toBe(true);
    expect(draftsEnabled('fresh-file')).toBe(true);
  });

  const rows: DraftRow[] = [
    {
      kind: 'review',
      okrId: 'o1',
      base: { wentWell: '', fellShort: '', nextSteps: '' },
      draft: { wentWell: 'a', fellShort: '', nextSteps: '' },
    },
    { kind: 'wizard', step: 2, intent: '目标' },
    {
      kind: 'textEdit',
      okrId: 'o1',
      krId: 'k1',
      base: { statement: 'a', successMetric: '' },
      draft: { statement: 'b', successMetric: '' },
    },
  ];

  it('lines are in the fixed order wizard, text edit, review', () => {
    expect(sortDraftRows(rows.map((row) => ({ row }))).map((r) => r.row.kind)).toEqual([
      'wizard',
      'textEdit',
      'review',
    ]);
  });

  it('drops rows whose OKR / KR is gone (counted) and rows saved since (voided)', () => {
    const result = filterDraftRows(rows, (row) =>
      row.kind === 'review'
        ? { exists: false }
        : row.kind === 'textEdit'
          ? { exists: true, unchangedSinceDraft: false }
          : { exists: true, unchangedSinceDraft: true },
    );
    expect(result.valid.map(draftRowKey)).toEqual(['wizard']);
    expect(result.deletedCount).toBe(1);
    expect(result.voidedCount).toBe(1);
  });

  it('every row gone → nothing valid (no bar)', () => {
    expect(filterDraftRows(rows, () => ({ exists: false })).valid).toEqual([]);
  });

  it('the draft file is versioned and validated', () => {
    const file = { version: 1, window: 'sticky', savedAt: 'x', rows };
    expect(draftFileSchema.safeParse(file).success).toBe(true);
    expect(draftFileSchema.safeParse({ ...file, version: 2 }).success).toBe(false);
    expect(draftFileSchema.safeParse({ ...file, rows: [] }).success).toBe(false);
    expect(draftFileSchema.safeParse({ ...file, extra: 1 }).success).toBe(false);
  });
});

describe('S3§12.3 restore over a spot (one case each)', () => {
  it('case 1: the spot has new unsaved edits → confirm first', () => {
    expect(restoreAction('dirty')).toBe('confirm');
  });
  it('case 2: the spot is untouched → restore at once', () => {
    expect(restoreAction('untouched')).toBe('restore');
  });
  it('case 3: the user already saved that spot → the row is voided', () => {
    expect(restoreAction('saved')).toBe('void');
  });
  it('several spots: one with new edits asks for the whole restore', () => {
    expect(combineRestoreActions(['restore', 'confirm'])).toBe('confirm');
    expect(combineRestoreActions(['restore'])).toBe('restore');
  });
});
