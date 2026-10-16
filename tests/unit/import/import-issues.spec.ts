import {
  parseImportFile,
  validateOkrDocument,
} from '../../../app/main/src/import/import-document.js';
import {
  FALLBACK_REASON,
  IMPORT_ISSUE_UI,
  issueLines,
  FIELD_LABELS,
  ISSUE_MESSAGES,
  describePlace,
  formatLocation,
  parseLocation,
  placeOf,
  presentIssue,
  type ImportIssueCode,
} from '@clarityokr/contracts';

/** #69: structured import issues and their plain-language rendering. */

type Doc = Record<string, any>;

const valid = (): Doc => ({
  schemaVersion: 1,
  exportedAt: '2026-10-15T00:00:00.000Z',
  objective: {
    title: '目标',
    period: '2026-Q4',
    pinned: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  keyResults: [
    {
      id: 'k1',
      statement: 'KR 1',
      successMetric: null,
      progress: 20,
      status: 'in_progress',
      removedAt: null,
    },
    {
      id: 'k2',
      statement: 'KR 2',
      successMetric: 'm',
      progress: null,
      status: 'not_started',
      removedAt: null,
    },
  ],
  progressEntries: [
    {
      id: 1,
      krId: 'k1',
      kind: 'set',
      value: 20,
      status: 'in_progress',
      revertsEntryId: null,
      recordedAt: '2026-10-02T00:00:00.000Z',
    },
  ],
  review: {
    wentWell: '好',
    fellShort: '',
    nextSteps: '',
    savedAt: '2026-10-03T00:00:00.000Z',
    snapshotAt: '2026-10-03T00:00:00.000Z',
    snapshot: [
      {
        krId: 'k1',
        statement: 'KR 1',
        successMetric: null,
        progress: 20,
        status: 'in_progress',
        removed: false,
      },
    ],
  },
});

const bytes = (v: unknown) => Buffer.from(JSON.stringify(v));
const single = (d: Doc) => parseImportFile(bytes(d));
const backup = (d: Doc) =>
  parseImportFile(
    bytes({
      schemaVersion: 1,
      kind: 'backup',
      exportedAt: '2026-10-15T00:00:00.000Z',
      appVersion: '0.3.0',
      okrs: [valid(), d],
    }),
  );

/** Every JSON key and enum value the files use: none may reach the screen. */
const ENGLISH = [
  ...Object.keys(FIELD_LABELS).flatMap((k) => k.split('.')),
  'schemaVersion',
  'exportedAt',
  'appVersion',
  'kind',
  'okrs',
  'not_started',
  'in_progress',
  'at_risk',
  'done',
  'set',
  'revert',
  'backup',
  'null',
];
function expectPlain(text: string): void {
  for (const word of ENGLISH) expect(text).not.toContain(word);
  expect(text).not.toMatch(/\[\d+\]/); // keyResults[2]
  expect(text).not.toMatch(/\w\.\w/); // a.b paths
  expect(text).not.toMatch(/[a-z][A-Z]/); // camelCase
}

/** code → how to break a valid document, and the expected 1-based place. */
const CASES: Array<[ImportIssueCode, string, (d: Doc) => void, string]> = [
  ['missing', 'a required field is absent', (d) => delete d.objective.title, '目标标题不见了'],
  [
    'wrong_type',
    'a value has the wrong JSON type',
    (d) => (d.objective.pinned = 'yes'),
    '置顶设置格式不对',
  ],
  [
    'empty',
    'required text is blank',
    (d) => (d.keyResults[1].statement = '  '),
    '第 2 个关键结果的描述是空的',
  ],
  [
    'too_long',
    'text over its limit (review section > 2000)',
    (d) => (d.review.wentWell = '字'.repeat(2001)),
    '做得好超过 2000 字',
  ],
  [
    'invalid_time',
    'a timestamp Date cannot read',
    (d) => (d.objective.createdAt = 'yesterday'),
    '创建时间不是有效的时间',
  ],
  [
    'invalid_status',
    'status not one of the four',
    (d) => (d.keyResults[1].status = 'blocked'),
    '第 2 个关键结果的状态不是可选的状态',
  ],
  [
    'not_integer',
    'progress is fractional',
    (d) => (d.keyResults[0].progress = 20.5),
    '第 1 个关键结果的进度带了小数',
  ],
  [
    'out_of_range',
    'progress outside 0–100',
    (d) => (d.keyResults[2 - 1].progress = 140),
    '第 2 个关键结果的进度超出 0 到 100',
  ],
  [
    'invalid_period',
    'period not YYYY-Qn',
    (d) => (d.objective.period = '2026-13'),
    '周期应写成 2026-Q4 这样的格式',
  ],
  [
    'no_key_results',
    'empty keyResults',
    (d) => ((d.keyResults = []), (d.progressEntries = []), (d.review = null)),
    '一个关键结果也没有',
  ],
  [
    'duplicate_key_result',
    'two KRs share an id',
    (d) => (d.keyResults[1].id = 'k1'),
    '第 2 个关键结果的编号和前面的重复',
  ],
  [
    'invalid_entry_id',
    'entry id not a positive integer',
    (d) => (d.progressEntries[0].id = 0),
    '第 1 条进度记录的编号不对',
  ],
  [
    'duplicate_entry',
    'two entries share an id',
    (d) => d.progressEntries.push({ ...d.progressEntries[0] }),
    '第 2 条进度记录的编号和前面的重复',
  ],
  [
    'unknown_key_result',
    'dangling krId',
    (d) => (d.progressEntries[0].krId = 'zz'),
    '第 1 条进度记录的所属关键结果找不到',
  ],
  [
    'invalid_entry_kind',
    'entry kind not set/revert',
    (d) => (d.progressEntries[0].kind = 'undo'),
    '第 1 条进度记录的记录类型不是可选的类型',
  ],
  [
    'unknown_entry',
    'revert points nowhere',
    (d) =>
      d.progressEntries.push({ ...d.progressEntries[0], id: 2, kind: 'revert', revertsEntryId: 9 }),
    '第 2 条进度记录要撤回的记录找不到',
  ],
  [
    'reverts_on_set',
    'a set entry names a reverted entry',
    (d) => (d.progressEntries[0].revertsEntryId = 1),
    '第 1 条进度记录不是撤回，却填了撤回的记录',
  ],
];

describe('#69 import issues', () => {
  describe.each(CASES)('%s (%s)', (code, _trigger, breakIt, text) => {
    it('single OKR: code, 1-based place, plain text', () => {
      const d = valid();
      breakIt(d);
      const issues = validateOkrDocument(d);
      expect(issues.map((i) => i.code)).toContain(code);
      const parsed = single(d);
      expect(parsed.ok).toBe(false);
      if (parsed.ok || parsed.problem.kind !== 'invalid') throw new Error('expected invalid');
      expect(parsed.problem.field).toBe('');
      expect(parsed.problem.reason.startsWith(text)).toBe(true);
      expectPlain(parsed.problem.reason);
    });
    it('backup: same code, place starts with 「第 2 个 OKR」', () => {
      const d = valid();
      breakIt(d);
      const parsed = backup(d);
      if (parsed.ok || parsed.problem.kind !== 'invalid') throw new Error('expected invalid');
      expect(parsed.problem.okrIndex).toBe(1);
      expect(parsed.problem.field).toBe('');
      const prefix = code === 'no_key_results' ? '第 2 个 OKR ' : '第 2 个 OKR 的';
      expect(parsed.problem.reason.startsWith(`${prefix}${text}`)).toBe(true);
      expectPlain(parsed.problem.reason);
    });
  });

  it('every code has a case above (the table is complete)', () => {
    const covered = new Set(CASES.map((c) => c[0]));
    const rest = (Object.keys(ISSUE_MESSAGES) as ImportIssueCode[]).filter((c) => !covered.has(c));
    expect(rest.sort()).toEqual(['too_many_key_results', 'unsupported_file_kind']);
  });

  it('B4 sentences are unchanged', () => {
    const d = valid();
    d.keyResults = Array.from({ length: 11 }, (_, i) => ({ ...d.keyResults[1], id: `x${i}` }));
    d.progressEntries = [];
    d.review = null;
    const one = single(d);
    if (one.ok || one.problem.kind !== 'invalid') throw new Error('expected invalid');
    expect(one.problem.reason).toBe('这个 OKR 有 11 个 KR，最多 10 个');
    const many = backup(d);
    if (many.ok || many.problem.kind !== 'invalid') throw new Error('expected invalid');
    expect(many.problem.reason).toBe('第 2 个 OKR 有 11 个 KR，最多 10 个');
  });

  it('file-level codes: unsupported kind, missing schemaVersion, backup header fields', () => {
    const kind = single({ ...valid(), kind: 'other' });
    if (kind.ok || kind.problem.kind !== 'invalid') throw new Error('expected invalid');
    expect(kind.problem.reason).toBe('不支持这种文件类型');
    const { schemaVersion: _, ...noVersion } = valid();
    const v = single(noVersion);
    if (v.ok || v.problem.kind !== 'invalid') throw new Error('expected invalid');
    expect(v.problem.reason).toBe('文件里缺少版本信息');
    const header = parseImportFile(
      bytes({ schemaVersion: 1, kind: 'backup', exportedAt: 'x', appVersion: '1', okrs: [] }),
    );
    if (header.ok || header.problem.kind !== 'invalid') throw new Error('expected invalid');
    expect(header.problem.reason).toBe('备份时间读不出来');
    for (const p of [kind, v, header])
      if (!p.ok && p.problem.kind === 'invalid') expectPlain(p.problem.reason);
  });

  it('validation collects every issue; the reply carries the first and the count of the rest', () => {
    const d = valid();
    d.keyResults[0].progress = 140;
    d.keyResults[1].status = 'blocked';
    d.objective.title = '';
    expect(validateOkrDocument(d)).toHaveLength(3);
    const parsed = single(d);
    if (parsed.ok || parsed.problem.kind !== 'invalid') throw new Error('expected invalid');
    expect(parsed.problem.more).toBe(2);
  });

  it('guard: every code renders without English keys or paths, at any place', () => {
    const places = [
      [],
      ['objective', 'title'],
      ['okrs', 4, 'keyResults', 2, 'progress'],
      ['review', 'snapshot', 0, 'krId'],
    ];
    for (const code of Object.keys(ISSUE_MESSAGES) as ImportIssueCode[]) {
      for (const location of places) {
        const { reason, field } = presentIssue({
          code,
          location,
          params: { expected: '对象', max: 2000, count: 11, limit: 10, okrNumber: 3 },
        });
        expect(field).toBe('');
        expectPlain(reason);
      }
    }
  });

  it('an unknown code falls back to the fallback text', () => {
    const { reason } = presentIssue({
      code: 'from_the_future' as ImportIssueCode,
      location: ['keyResults', 0, 'progress'],
      params: {},
    });
    expect(reason).toBe(FALLBACK_REASON);
  });

  it('locations are structured and 1-based', () => {
    const location = parseLocation('okrs[3].keyResults[2].progress');
    expect(location).toEqual(['okrs', 3, 'keyResults', 2, 'progress']);
    expect(formatLocation(location)).toBe('okrs[3].keyResults[2].progress');
    expect(placeOf(location).parts).toEqual([
      { list: 'okrs', number: 4 },
      { list: 'keyResults', number: 3 },
      { field: 'progress', container: 'keyResults' },
    ]);
    expect(describePlace(['keyResults', 2])).toBe('第 3 个关键结果');
    expect(describePlace([])).toBe('');
    expect(describePlace(['okrs', 3, 'keyResults', 0, 'progress'])).toBe(
      '第 4 个 OKR 的第 1 个关键结果的进度',
    );
  });

  describe('detail lines: at most 5, the rest merged (99+ from 100)', () => {
    const one = (n: number) => ({
      code: 'out_of_range' as ImportIssueCode,
      location: ['keyResults', n, 'progress'],
      params: {},
    });
    const five = [0, 1, 2, 3, 4].map(one);
    it.each([
      [1, '另有 1 处'],
      [99, '另有 99 处'],
      [100, '另有 99+ 处'],
    ])('n = %i → %s', (n, line) => {
      expect(IMPORT_ISSUE_UI.moreLine(n)).toBe(line);
      // 4 shown + n merged; 5 issues in all still fit on 5 lines, so n starts at 2 here
      if (n === 1) return expect(issueLines(five, 5)).not.toContain(line);
      const lines = issueLines(five, 4 + n);
      expect(lines).toHaveLength(5);
      expect(lines[4]).toBe(line);
      expect(lines[0]).toBe('第 1 个关键结果的进度超出 0 到 100');
    });
    it('5 issues: all five, no merged line', () => {
      expect(issueLines(five, 5)).toHaveLength(5);
      expect(issueLines(five, 5)[4]).toBe('第 5 个关键结果的进度超出 0 到 100');
    });
  });
});

describe('#69 single-OKR body sentence', () => {
  it('is the final copy, no placeholder', () => {
    expect(IMPORT_ISSUE_UI.singleBody).toBe('这个 OKR 有误，没有导入。');
  });
});
