import {
  EXIT_CONFIRM_REASON_ORDER,
  decideExitConfirmation,
  ipcFail,
  ipcOk,
  parseExportRequest,
  parseKrIdRequest,
  parseOkrIdRequest,
  parseReplaceProgressRequest,
  parseRestartRequest,
  parseRevealRequest,
  parseSaveReviewRequest,
  parseSetPeriodRequest,
  parseSetProgressRequest,
  type ExitConfirmationInput,
  type StorageModeName,
  type UnsavedFlags,
} from '@clarityokr/contracts';

const FAMILY = '👨‍👩‍👧‍👦';

function reasonOf(parsed: { ok: boolean }): { field?: string; reason?: string } | null {
  return parsed.ok
    ? null
    : (parsed as unknown as { error: { field?: string; reason?: string } }).error;
}

describe('result envelope', () => {
  it('ipcOk / ipcFail build the documented shapes', () => {
    expect(ipcOk({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
    expect(ipcFail('NOT_FOUND', 'nope')).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'nope' },
    });
    expect(ipcFail('INVALID_REQUEST', 'bad', { field: 'x', reason: 'missing' })).toEqual({
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'bad', field: 'x', reason: 'missing' },
    });
  });
});

describe('request validators', () => {
  it('parseOkrIdRequest / parseKrIdRequest accept a plain id and nothing else', () => {
    expect(parseOkrIdRequest({ okrId: 'abc' })).toEqual({ ok: true, value: { okrId: 'abc' } });
    expect(parseKrIdRequest({ krId: 'abc' })).toEqual({ ok: true, value: { krId: 'abc' } });
    expect(reasonOf(parseOkrIdRequest({ krId: 'abc' }))).toMatchObject({
      field: 'krId',
      reason: 'unknown_field',
    });
  });

  it('parseSetProgressRequest: value omitted keeps the value, null clears, 0..100 integers pass', () => {
    expect(parseSetProgressRequest({ krId: 'k', status: 'done' })).toEqual({
      ok: true,
      value: { krId: 'k', status: 'done' },
    });
    expect(parseSetProgressRequest({ krId: 'k', status: 'done', value: undefined })).toEqual({
      ok: true,
      value: { krId: 'k', status: 'done' },
    });
    for (const value of [0, 1, 99, 100, null]) {
      expect(parseSetProgressRequest({ krId: 'k', status: 'done', value })).toEqual({
        ok: true,
        value: { krId: 'k', status: 'done', value },
      });
    }
  });

  it.each([
    [-1, 'below_min'],
    [101, 'above_max'],
    [0.5, 'not_integer'],
    [Number.NaN, 'not_integer'],
    ['7', 'wrong_type'],
    [[], 'wrong_type'],
    [false, 'wrong_type'],
  ])('parseSetProgressRequest rejects value %p as %s', (value, reason) => {
    expect(reasonOf(parseSetProgressRequest({ krId: 'k', status: 'done', value }))).toMatchObject({
      field: 'value',
      reason,
    });
  });

  it('parseReplaceProgressRequest requires value, status is optional', () => {
    expect(parseReplaceProgressRequest({ krId: 'k', value: 3 })).toEqual({
      ok: true,
      value: { krId: 'k', value: 3 },
    });
    expect(parseReplaceProgressRequest({ krId: 'k', value: null, status: 'at_risk' })).toEqual({
      ok: true,
      value: { krId: 'k', value: null, status: 'at_risk' },
    });
    expect(reasonOf(parseReplaceProgressRequest({ krId: 'k' }))).toMatchObject({
      field: 'value',
      reason: 'missing',
    });
    expect(reasonOf(parseReplaceProgressRequest({ krId: 'k', value: undefined }))).toMatchObject({
      field: 'value',
      reason: 'missing',
    });
  });

  it('parseSetPeriodRequest accepts YYYY-Qn and null only', () => {
    expect(parseSetPeriodRequest({ okrId: 'a', period: '2026-Q1' })).toEqual({
      ok: true,
      value: { okrId: 'a', period: '2026-Q1' },
    });
    expect(parseSetPeriodRequest({ okrId: 'a', period: null })).toEqual({
      ok: true,
      value: { okrId: 'a', period: null },
    });
    for (const period of ['2026-q1', '2026-Q5', '2026-Q', ' 2026-Q1', '2026-Q1 ', '20266-Q1']) {
      expect(reasonOf(parseSetPeriodRequest({ okrId: 'a', period }))).toMatchObject({
        field: 'period',
        reason: 'invalid_value',
      });
    }
  });

  describe('parseSaveReviewRequest', () => {
    const base = { okrId: 'a', wentWell: 'x', fellShort: '', nextSteps: '' };

    it('accepts one non-blank section and does not trim or truncate the text', () => {
      expect(parseSaveReviewRequest({ ...base, wentWell: '  spaced  ' })).toEqual({
        ok: true,
        value: { ...base, wentWell: '  spaced  ' },
      });
    });

    it('counts graphemes: 2000 emoji pass, 2001 fail', () => {
      expect(parseSaveReviewRequest({ ...base, nextSteps: '😀'.repeat(2000) }).ok).toBe(true);
      expect(
        reasonOf(parseSaveReviewRequest({ ...base, nextSteps: '😀'.repeat(2001) })),
      ).toMatchObject({
        field: 'nextSteps',
        reason: 'too_long',
      });
      expect(parseSaveReviewRequest({ ...base, wentWell: FAMILY.repeat(200) }).ok).toBe(true);
    });

    it('rejects a stacked-combining-mark cluster and 33-unit clusters, accepts 32', () => {
      expect(
        reasonOf(parseSaveReviewRequest({ ...base, wentWell: 'a' + '\u0301'.repeat(40) })),
      ).toMatchObject({
        field: 'wentWell',
        reason: 'cluster_too_long',
      });
      expect(parseSaveReviewRequest({ ...base, wentWell: 'a' + '\u0301'.repeat(31) }).ok).toBe(
        true,
      );
      expect(parseSaveReviewRequest({ ...base, wentWell: 'a' + '\u0301'.repeat(32) }).ok).toBe(
        false,
      );
    });

    it('rejects when every section is blank, with field "review"', () => {
      expect(
        reasonOf(
          parseSaveReviewRequest({ okrId: 'a', wentWell: ' ', fellShort: '\n', nextSteps: '\t' }),
        ),
      ).toMatchObject({
        field: 'review',
        reason: 'empty',
      });
    });
  });

  it('parseExportRequest allows exactly md and json', () => {
    expect(parseExportRequest({ okrId: 'a', format: 'md' }).ok).toBe(true);
    expect(parseExportRequest({ okrId: 'a', format: 'json' }).ok).toBe(true);
    for (const format of ['pdf', 'MD', ' md', '', 'markdown']) {
      expect(reasonOf(parseExportRequest({ okrId: 'a', format }))).toMatchObject({
        field: 'format',
        reason: 'invalid_value',
      });
    }
  });

  it('parseRevealRequest takes a bounded non-empty string', () => {
    expect(parseRevealRequest({ path: '/tmp/a.md' })).toEqual({
      ok: true,
      value: { path: '/tmp/a.md' },
    });
    expect(reasonOf(parseRevealRequest({ path: '' }))).toMatchObject({ reason: 'empty' });
    expect(reasonOf(parseRevealRequest({ path: 'x'.repeat(4097) }))).toMatchObject({
      reason: 'too_long',
    });
  });

  it('parseRestartRequest reads three boolean flags and an optional confirmed', () => {
    const unsaved = { wizard: true, textEdit: false, reviewDraft: true };
    expect(parseRestartRequest({ unsaved })).toEqual({ ok: true, value: { unsaved } });
    expect(parseRestartRequest({ unsaved, confirmed: true })).toEqual({
      ok: true,
      value: { unsaved, confirmed: true },
    });
    expect(reasonOf(parseRestartRequest({ unsaved: { ...unsaved, wizard: 'yes' } }))).toMatchObject(
      {
        field: 'unsaved.wizard',
        reason: 'wrong_type',
      },
    );
  });
});

describe('decideExitConfirmation', () => {
  const none: UnsavedFlags = { wizard: false, textEdit: false, reviewDraft: false };
  const decide = (
    storageMode: StorageModeName,
    dbHasData: boolean,
    unsaved: Partial<UnsavedFlags> = {},
  ) =>
    decideExitConfirmation({
      storageMode,
      dbHasData,
      unsaved: { ...none, ...unsaved },
    } as ExitConfirmationInput);

  it('normal and fresh-file modes ask only for unsaved content, never because of stored data', () => {
    for (const mode of ['normal', 'fresh-file'] as const) {
      expect(decide(mode, true).needsConfirm).toBe(false);
      expect(decide(mode, false).needsConfirm).toBe(false);
      expect(decide(mode, true, { wizard: true })).toMatchObject({
        needsConfirm: true,
        reasons: ['wizard'],
      });
    }
  });

  it('memory mode with an empty database asks nothing by itself', () => {
    expect(decide('memory', false)).toEqual({
      needsConfirm: false,
      reasons: [],
      memoryOnly: false,
      dialogWindow: 'main',
      windowsToShow: [],
    });
  });

  it('memory mode with data (any objective or saved review) asks, memory-only, in the main window', () => {
    expect(decide('memory', true)).toEqual({
      needsConfirm: true,
      reasons: ['memory_data'],
      memoryOnly: true,
      dialogWindow: 'main',
      windowsToShow: ['main'],
    });
  });

  it('memory + empty database + unsaved wizard still asks, with the wizard sentence only', () => {
    expect(decide('memory', false, { wizard: true })).toMatchObject({
      needsConfirm: true,
      reasons: ['wizard'],
      memoryOnly: false,
    });
  });

  it('each single unsaved class asks in the window that holds it', () => {
    expect(decide('normal', false, { wizard: true })).toMatchObject({
      dialogWindow: 'main',
      windowsToShow: ['main'],
    });
    expect(decide('normal', false, { textEdit: true })).toMatchObject({
      reasons: ['text_edit'],
      dialogWindow: 'sticky',
      windowsToShow: ['sticky'],
    });
    expect(decide('normal', false, { reviewDraft: true })).toMatchObject({
      reasons: ['review_draft'],
      dialogWindow: 'sticky',
      windowsToShow: ['sticky'],
    });
  });

  it('text edit + review draft are both sticky-window classes: dialog stays in the sticky note', () => {
    expect(decide('normal', false, { textEdit: true, reviewDraft: true })).toMatchObject({
      reasons: ['text_edit', 'review_draft'],
      dialogWindow: 'sticky',
      windowsToShow: ['sticky'],
    });
  });

  it('several classes: fixed order, dialog in the main window, every involved window shown', () => {
    const all = decide('memory', true, { wizard: true, textEdit: true, reviewDraft: true });
    expect(all).toEqual({
      needsConfirm: true,
      reasons: ['wizard', 'text_edit', 'review_draft', 'memory_data'],
      memoryOnly: false,
      dialogWindow: 'main',
      windowsToShow: ['main', 'sticky'],
    });
    expect(all.reasons).toEqual([...EXIT_CONFIRM_REASON_ORDER]);
    expect(decide('normal', false, { wizard: true, textEdit: true })).toMatchObject({
      reasons: ['wizard', 'text_edit'],
      dialogWindow: 'main',
      windowsToShow: ['main', 'sticky'],
    });
    expect(decide('memory', true, { reviewDraft: true })).toMatchObject({
      reasons: ['review_draft', 'memory_data'],
      memoryOnly: false,
      dialogWindow: 'main',
      windowsToShow: ['main', 'sticky'],
    });
  });

  it('is exhaustive over every combination of the 5 inputs: needsConfirm iff any reason applies', () => {
    for (const mode of ['normal', 'fresh-file', 'memory'] as const) {
      for (const dbHasData of [false, true]) {
        for (let bits = 0; bits < 8; bits += 1) {
          const unsaved = {
            wizard: !!(bits & 1),
            textEdit: !!(bits & 2),
            reviewDraft: !!(bits & 4),
          };
          const result = decide(mode, dbHasData, unsaved);
          const expected =
            unsaved.wizard ||
            unsaved.textEdit ||
            unsaved.reviewDraft ||
            (mode === 'memory' && dbHasData);
          expect(result.needsConfirm).toBe(expected);
          expect(result.reasons.length > 0).toBe(expected);
        }
      }
    }
  });
});
