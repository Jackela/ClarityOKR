import {
  parseImportFile,
  validateOkrDocument,
} from '../../../app/main/src/import/import-document.js';
import {
  FALLBACK_REASON,
  IMPORT_UNCHANGED_LINE,
  displayableVersion,
  importFileProblemCopy,
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

describe('#69 no field falls back to a generic sentence', () => {
  it('progressEntries[i].kind uses the 记录类型 sentence, not the status one', () => {
    const d = valid();
    d.progressEntries[0].kind = 'undo';
    const parsed = single(d);
    if (parsed.ok || parsed.problem.kind !== 'invalid') throw new Error('expected invalid');
    expect(parsed.problem.reason).toBe('第 1 条进度记录的记录类型不是可选的类型');
    expect(parsed.problem.reason).not.toContain('状态');
  });

  it('every field of every item, missing or of the wrong type, gets a named place', () => {
    const generic = /某一项|第 \d+ 项/;
    const seen: string[] = [];
    const lists: Array<[string, (d: Doc) => Record<string, unknown>]> = [
      ['objective', (d) => d as unknown as Record<string, unknown>],
      ['keyResults', (d) => d.keyResults[0] as unknown as Record<string, unknown>],
      ['progressEntries', (d) => d.progressEntries[0] as unknown as Record<string, unknown>],
      ['review', (d) => d.review as unknown as Record<string, unknown>],
      ['snapshot', (d) => d.review.snapshot[0] as unknown as Record<string, unknown>],
    ];
    for (const [, pick] of lists) {
      for (const key of Object.keys(pick(valid()))) {
        for (const breakIt of [
          (o: Record<string, unknown>) => delete o[key],
          (o: Record<string, unknown>) => (o[key] = { bad: true }),
        ]) {
          const d = valid();
          breakIt(pick(d));
          for (const issue of validateOkrDocument(d)) {
            const { reason } = presentIssue(issue);
            seen.push(reason);
            expect(reason).not.toBe(FALLBACK_REASON);
            expect(reason).not.toMatch(generic);
            expectPlain(reason);
          }
        }
      }
    }
    expect(seen.length).toBeGreaterThan(20);
  });
});

describe('#85 file problem dialogs (copy.md, verbatim)', () => {
  const ui = (c: { title: string; body: string; unchanged: string }) =>
    [c.title, c.body, c.unchanged].join('\n');

  it('not_json: 「这个文件导入不了」, error tone, ends with 「数据没有任何改动。」', () => {
    const c = importFileProblemCopy('not_json', {});
    expect(c).toEqual({
      title: '这个文件导入不了',
      body: '这不是 ClarityOKR 导出的文件，或者文件已经损坏。请选择 ClarityOKR 导出的 OKR 或备份文件。',
      unchanged: '数据没有任何改动。',
      tone: 'error',
    });
  });

  it('unsupported_version with a 1–4 digit version shows it', () => {
    const c = importFileProblemCopy('unsupported_version', { version: '2' });
    expect(c.title).toBe('这个文件的版本不支持');
    expect(c.body).toBe(
      '这个文件来自版本 2，当前只能导入版本 1 的文件。请用最新版 ClarityOKR 重新导出后再导入。',
    );
    expect(c.tone).toBe('error');
    expect(c.unchanged).toBe(IMPORT_UNCHANGED_LINE);
    expect(importFileProblemCopy('unsupported_version', { version: '9999' }).body).toContain(
      '来自版本 9999，',
    );
  });

  it.each(['v2', '2.0', '1e3', '', ' 2', '-1', '12345', '00000', 'schemaVersion'])(
    'unsupported_version with %p (not 1–4 pure digits) → fallback sentence',
    (version) => {
      expect(displayableVersion(version)).toBeNull();
      expect(importFileProblemCopy('unsupported_version', { version }).body).toBe(
        '这个文件来自不支持的版本，当前只能导入版本 1 的文件。请用最新版 ClarityOKR 重新导出后再导入。',
      );
    },
  );

  it('unsupported_version without a version → fallback sentence', () => {
    expect(importFileProblemCopy('unsupported_version', {}).body).toMatch(
      /^这个文件来自不支持的版本，/,
    );
  });

  it('empty_backup: information tone, 「备份里没有 OKR」', () => {
    expect(importFileProblemCopy('empty_backup', {})).toEqual({
      title: '备份里没有 OKR',
      body: '这个备份里一个 OKR 也没有，没有可导入的内容。',
      unchanged: '数据没有任何改动。',
      tone: 'info',
    });
  });

  it.each([
    ['not_json', undefined],
    ['unsupported_version', '3'],
    ['unsupported_version', 'v3.x'],
    ['unsupported_version', 'okrs[0].schema_version'],
    ['empty_backup', undefined],
  ] as const)('%s (%p): no raw codes, field names or paths in the UI text', (code, version) => {
    const text = ui(importFileProblemCopy(code, { version }));
    expect(text).not.toMatch(/not_json|unsupported_version|empty_backup/);
    const rest = text.replace(/ClarityOKR|OKR/g, '');
    expect(rest).not.toMatch(/[A-Za-z]+_[A-Za-z]+/); // snake_case
    expect(rest).not.toMatch(/[a-z]+[A-Z][A-Za-z]*/); // camelCase
    expect(rest).not.toMatch(/[A-Za-z0-9\]]\.[A-Za-z]/); // dotted path
    expect(rest).not.toMatch(/\[/); // bracketed path
    expect(rest).not.toMatch(/[A-Za-z]/); // nothing else in Latin letters
  });
});
