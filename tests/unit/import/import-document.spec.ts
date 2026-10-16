import { parseImportFile } from '../../../app/main/src/import/import-document.js';

const kr = (i: number, removedAt: string | null = null) => ({
  id: `k${i}`,
  statement: `KR ${i}`,
  successMetric: null,
  progress: null,
  status: 'not_started',
  removedAt,
});

const doc = (keyResults: unknown[]) => ({
  schemaVersion: 1,
  exportedAt: '2026-10-15T00:00:00.000Z',
  objective: {
    title: '目标',
    period: null,
    pinned: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  keyResults,
  progressEntries: [],
  review: null,
});

const parse = (value: unknown) => parseImportFile(Buffer.from(JSON.stringify(value)));

describe('import validation: key result count (B4)', () => {
  it('accepts 10 key results that are not removed', () => {
    expect(parse(doc(Array.from({ length: 10 }, (_, i) => kr(i)))).ok).toBe(true);
  });

  it('rejects 11 in plain language, without the field path (B4)', () => {
    expect(parse(doc(Array.from({ length: 11 }, (_, i) => kr(i))))).toMatchObject({
      ok: false,
      problem: {
        kind: 'invalid',
        field: '',
        reason: '这个 OKR 有 11 个 KR，最多 10 个',
        more: 0,
        issues: [{ code: 'too_many_key_results', location: ['keyResults'] }],
        total: 1,
      },
    });
  });

  it('removed key results do not count', () => {
    const list = [
      ...Array.from({ length: 10 }, (_, i) => kr(i)),
      kr(10, '2026-10-02T00:00:00.000Z'),
      kr(11, '2026-10-03T00:00:00.000Z'),
    ];
    expect(parse(doc(list)).ok).toBe(true);
  });

  it('still rejects an empty list', () => {
    expect(parse(doc([]))).toMatchObject({
      ok: false,
      problem: { field: '', issues: [{ code: 'no_key_results', location: ['keyResults'] }] },
    });
  });

  it('N30: a KR without removedAt is rejected by the schema (missing field)', () => {
    const { removedAt: _drop, ...noField } = kr(0);
    expect(parse(doc([noField]))).toMatchObject({
      ok: false,
      problem: {
        kind: 'invalid',
        field: '',
        issues: [{ code: 'missing', location: ['keyResults', 0, 'removedAt'] }],
      },
    });
  });

  it('N30: KRs without removedAt still count as active for the cap', () => {
    const list = Array.from({ length: 11 }, (_, i) => {
      const { removedAt: _drop, ...noField } = kr(i);
      return noField;
    });
    expect(parse(doc(list))).toMatchObject({
      ok: false,
      problem: { field: '', reason: '这个 OKR 有 11 个 KR，最多 10 个' },
    });
  });
});
